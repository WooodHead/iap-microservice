import bodyParser from "body-parser";
import cors from "cors";
import express from "express";
import * as http from "http";

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

api.post("/receipt", async (req, res) => {
  try {
    // Params:
    // token - Apple/Google purchase token
    // import - Optional flag to import ALL purchases from this receipt (including those newer than the original receipt).
    // userId - Optional user ID to put against this purchase.
    //  If not supplied, will attempt to find user id from previous purchase
    // syncUserId - All related purchases will be changed to this user id. Useful if userId changes for some reason

    const sku = req.body.sku || "";
    const includeNewer = !!req.body.import;
    const token = req.body.token;
    const platform = req.body.platform;
    const userId = req.body.user_id || null;
    const syncUserId = !!req.body.sync_user;

    const provider = getProvider(platform);
    const purchase = await provider.purchase(
      token,
      sku,
      includeNewer,
      userId,
      syncUserId
    );
    res.send(purchase);
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

api.post("/webhook/apple", (req, res) => {
  // Apple server-server notification

  // const body = req.body;
  // console.log(body);

  res.sendStatus(200);
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

api.get("/user/:userId/purchases/:originalId", async (req, res) => {
  // Get all purchases relating to a given purchase ID
  logger.debug(`/user/${req.params.userId}/purchases/${req.params.originalId}`);
  try {
    const userId = req.params.userId;
    const originalPurchaseId = req.params.originalId;
    const purchases = await db.getPurchasesByOriginalPurchaseId(
      userId,
      originalPurchaseId
    );
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
  logger.info(`Server started on port ${port}...`);
});
