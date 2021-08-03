import bodyParser from "body-parser";
import cors from "cors";
import express from "express";
import * as http from "http";
import { AppleVerifyReceiptResponseBodySuccess } from "types-apple-iap";

import db from "./database";
import { getLogger } from "./logging";
import { getProvider } from "./providers";
import { Google } from "./providers/Google";

const port = process.env.PORT || 8080;

const logger = getLogger("api");

const api = express();
api.use(cors());
api.use(bodyParser.json({ limit: "15mb" }));

api.post("/validate", async (req, res) => {
  try {
    const provider = getProvider(req.body.platform);
    const result = await provider.validate(req.body.token, req.body.sku);
    res.send(result);
  } catch (e) {
    logger.error(e.message);
    res.status(500);
    res.send({
      error: e.message,
    });
  }
});

api.post("/purchase", async (req, res) => {
  try {
    // Params:
    // token - Apple/Google purchase token
    // import - Optional flag to import ALL purchases from this receipt (including those newer than the original receipt).
    // userId - Optional user ID to put against this purchase.
    //  If not supplied, will attempt to find user id from previous purchase
    // syncUserId - All related purchases will be changed to this user id. Useful if userId changes for some reason

    let userId = req.body.user_id || null;
    const sku = req.body.sku || "";
    const includeNewer = !!req.body.import;
    const syncUserId = !!req.body.sync_user;
    const token = req.body.token;
    const platform = req.body.platform;

    const provider = getProvider(platform);

    const response = await provider.validate(token, sku);
    const parsedReceipt = await provider.parseReceipt(
      response as AppleVerifyReceiptResponseBodySuccess,
      token,
      sku,
      includeNewer
    );

    // If userId was not passed, lookup user ID from past purchases,
    // if it was, check that it matches what we have on file.
    // If it doesn't match, update all existing purchases with the new userId
    const existingUserId = await db.getUserId(
      parsedReceipt.purchases.map((item) => item.orderId)
    );
    if (!userId) {
      userId = existingUserId;
    } else if (
      syncUserId &&
      existingUserId != null &&
      userId != existingUserId
    ) {
      await db.syncUserId(existingUserId, userId);
    }

    parsedReceipt.receipt.userId = userId;
    let dbReceipt = await db.getReceiptByHash(parsedReceipt.receipt.hash);
    if (!dbReceipt) {
      dbReceipt = await db.createReceipt(parsedReceipt.receipt);
    } else {
      if (userId) {
        dbReceipt.userId = userId;
      }
      dbReceipt = await db.updateReceipt(dbReceipt);
    }

    // parseReceipt will return purchases sorted desc. Reverse them so we save them
    // in chronological order allowing linked and original purchase links to be established
    const purchases = parsedReceipt.purchases;
    purchases.reverse();
    let returnPurchase = null;
    for (const purchase of purchases) {
      purchase.receiptId = dbReceipt.id;
      if (userId) {
        purchase.userId = userId;
      }

      if (
        platform === "android" &&
        purchase.isSubscription &&
        purchase.linkedToken
      ) {
        const linkedHash = provider.getHash(purchase.linkedToken);
        const linkedPurchases = await db.getPurchasesByReceiptHash(linkedHash);
        if (linkedPurchases.length) {
          purchase.linkedOrderId = linkedPurchases[0].orderId;
          purchase.originalOrderId = linkedPurchases[0].originalOrderId;
        }
      }

      let dbPurchase = await db.getPurchaseByOrderId(purchase.orderId);

      if (
        purchase.originalOrderId &&
        purchase.orderId != purchase.originalOrderId
      ) {
        const originalPurchase = await db.getPurchaseByOrderId(
          purchase.originalOrderId
        );
        const linkedPurchase = await db.getPurchaseByOrderId(
          purchase.linkedOrderId
        );
        if (originalPurchase) {
          purchase.originalPurchaseId = originalPurchase.id;
        }
        if (linkedPurchase) {
          purchase.linkedPurchaseId = linkedPurchase.id;
        }
      }

      if (!dbPurchase) {
        dbPurchase = await db.createPurchase(purchase);
      } else {
        // Only reprocess this purchase is the current receipt is from before
        // the one we have on file
        // This prevents overwriting historic subscription statuses and token values
        // for old purchases
        if (dbPurchase.receiptDate >= purchase.receiptDate) {
          dbPurchase = await db.updatePurchase(dbPurchase.id, purchase);
        }
      }

      returnPurchase = dbPurchase;
    }

    res.send(returnPurchase);
  } catch (e) {
    logger.error(e.message);
    res.status(500);
    res.send({
      error: e.message,
    });
  }
});

api.get("/purchase/:id", async (req, res) => {
  try {
    const purchase = await db.getPurchaseById(req.params.id);
    if (purchase) {
      res.send(purchase);
    } else {
      res.sendStatus(404);
    }
  } catch (e) {
    logger.error(e.message);
    res.status(500);
    res.send({
      error: e.message,
    });
  }
});

api.get("/receipt/:id", async (req, res) => {
  try {
    const receipt = await db.getReceiptById(req.params.id);
    if (receipt) {
      res.send(receipt);
    } else {
      res.sendStatus(404);
    }
  } catch (e) {
    logger.error(e.message);
    res.status(500);
    res.send({
      error: e.message,
    });
  }
});

api.get("/user/:userId/purchases", async (req, res) => {
  try {
    const userId = req.params.userId;
    const purchases = await db.getPurchasesByUserId(userId);
    res.send(purchases);
  } catch (e) {
    logger.error(e.message);
    res.status(500);
    res.send({
      error: e.message,
    });
  }
});

api.get("/user/:userId/receipts", async (req, res) => {
  try {
    const userId = req.params.userId;
    const receipts = await db.getReceiptsByUserId(userId);
    res.send(receipts);
  } catch (e) {
    logger.error(e.message);
    res.status(500);
    res.send({
      error: e.message,
    });
  }
});

api.post("/product", async (req, res) => {
  try {
    const id = req.body.id || null;
    const skuAndroid = req.body.sku_android || null;
    const skuIOS = req.body.sku_ios || null;
    let price = req.body.price;
    const currency = req.body.currency;

    if (!skuAndroid && !skuIOS) {
      throw Error("sku_android and/or sku_ios are required");
    }
    if (isNaN(price)) {
      throw Error("price is required");
    }
    if (!currency) {
      throw Error("currency is required");
    }

    price = parseInt(price, 10);

    let product;
    if (id) {
      product = await db.updateProduct({
        id,
        skuAndroid,
        skuIOS,
        price,
        currency: currency.toUpperCase(),
      });
    } else {
      product = await db.createProduct({
        skuAndroid,
        skuIOS,
        price,
        currency: currency.toUpperCase(),
      });
    }

    res.send(product);
  } catch (e) {
    logger.error(e.message);
    res.status(500);
    res.send({
      error: e.message,
    });
  }
});

api.get("/product/:productId", async (req, res) => {
  try {
    const productId = req.params.productId;
    const product = await db.getProductById(productId);
    res.send(product);
  } catch (e) {
    logger.error(e.message);
    res.status(500);
    res.send({
      error: e.message,
    });
  }
});

api.get("/cron", async (req, res) => {
  // Testing out voided purchases
  const provider = getProvider("android") as Google;
  const result = await provider.getVoidedPurchases();
  res.send(result);
});

http.createServer(api).listen(port, async () => {
  logger.info("Server started...");
});
