import bodyParser from "body-parser";
import cors from "cors";
import express from "express";
import * as http from "http";
import fetch from "node-fetch";

import db from "./database";
import { getLogger } from "./logging";
import { getProvider } from "./providers";

const port = process.env.PORT || 8080;

const logger = getLogger("api");

const api = express();
api.use(cors());
api.use(bodyParser.json({ limit: "15mb" }));

const validateAuthTokenMiddleware = (req: any, res: any, next: any) => {
  if (!req.headers["authorization"]) {
    logger.warn("Missing Authorization header");
    res.status(401).send({ error: "Missing Authorization header" });
    return;
  }

  if (req.headers["authorization"] === `ApiKey ${process.env.API_KEY}`) {
    next();
  } else {
    logger.warn("Invalid auth token");
    res.status(401).send({ error: "Invalid auth token" });
  }
};

api.post("/validate", validateAuthTokenMiddleware, async (req, res) => {
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

api.post("/receipt", validateAuthTokenMiddleware, async (req, res) => {
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
    const skipWebhook = !!req.body.skip_webhook;

    const provider = getProvider(platform);
    const purchaseEvent = await provider.processToken(
      token,
      sku,
      includeNewer,
      userId,
      syncUserId
    );
    res.send(purchaseEvent.data);
    if (!skipWebhook) {
      await provider.sendPurchaseWebhook(purchaseEvent);
    }
  } catch (e) {
    logger.error(e.message);
    res.status(500);
    res.send({
      error: e.message,
    });
  }
});

api.get("/receipt/:id", validateAuthTokenMiddleware, async (req, res) => {
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

api.get("/purchase/:id", validateAuthTokenMiddleware, async (req, res) => {
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

api.get(
  "/user/:userId/purchases",
  validateAuthTokenMiddleware,
  async (req, res) => {
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
  }
);

api.get(
  "/user/:userId/purchases/:originalId",
  validateAuthTokenMiddleware,
  async (req, res) => {
    // Get all purchases relating to a given purchase ID
    logger.debug(
      `/user/${req.params.userId}/purchases/${req.params.originalId}`
    );
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
  }
);

api.get(
  "/user/:userId/receipts",
  validateAuthTokenMiddleware,
  async (req, res) => {
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
  }
);

api.post("/product", validateAuthTokenMiddleware, async (req, res) => {
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

api.get(
  "/product/:productId",
  validateAuthTokenMiddleware,
  async (req, res) => {
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
  }
);

api.post("/webhook/apple", async (req, res) => {
  logger.debug("/webhook/apple");
  // Apple server-server notification
  if (process.env.WEBHOOK_RELAY_APPLE_ENDPOINT) {
    try {
      // Relay the message forward
      const forwardHeaders = [
        "Content-Type",
        "User-Agent",
        "Apple-Originating-System",
        "Apple-Seq",
        "Apple-Tk",
        "B3",
        "X-Apple-Jingle-Correlation-Key",
        "X-Apple-Request-Uuid",
        "X-B3-Spanid",
        "X-B3-Traceid",
      ];
      const headers: any = {};
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        if (forwardHeaders.indexOf(req.rawHeaders[i]) > -1) {
          headers[req.rawHeaders[i]] = req.rawHeaders[i + 1];
        }
      }
      await fetch(process.env.WEBHOOK_RELAY_APPLE_ENDPOINT, {
        method: req.method,
        body: req.body,
        headers: headers,
      });
      logger.debug("Successfully relayed apple webhook");
    } catch (e) {
      logger.error(`Failed to relay apple webhook: ${e.message}`);
    }
  } else {
    logger.debug("Will not relay apple webhook");
  }

  try {
    await db.addIncomingNotification("ios", req.body);
    const provider = getProvider("ios");
    const purchaseEvent = await provider.serverNotification(req.body);
    await provider.sendPurchaseWebhook(purchaseEvent);
  } catch (e) {
    logger.error(`Failed to process apple webhook: ${e.message}`);
  }

  res.sendStatus(200);
});

api.post("/webhook/google", async (req, res) => {
  logger.debug("/webhook/google");
  // Google server-server notification
  try {
    await db.addIncomingNotification("android", req.body);
    const provider = getProvider("android");
    const purchaseEvent = await provider.serverNotification(req.body);
    await provider.sendPurchaseWebhook(purchaseEvent);
  } catch (e) {
    logger.error(`Failed to process google webhook: ${e.message}`);
  }

  res.sendStatus(200);
});

api.get("/cron", async (req, res) => {
  logger.debug("/cron");
  // // Testing out voided purchases
  // const provider = getProvider("android") as Google;
  // const result = await provider.getVoidedPurchases();

  try {
    const purchases = await db.getPurchasesToRefresh();
    logger.info(`Refreshing ${purchases.length} purchases`);
    for (const purchase of purchases) {
      const receipt = await db.getReceiptById(purchase.receiptId);
      const provider = getProvider(purchase.platform);
      const purchaseEvent = await provider.processToken(
        receipt.token,
        purchase.productSku,
        true
      );

      await provider.sendPurchaseWebhook(purchaseEvent);
    }
    res.send("OK");
  } catch (e) {
    logger.error(`Cron failed: ${e}`);
    res.send(500);
  }
});

api.get("/healthcheck", (req, res) => {
  res.sendStatus(200);
});

http.createServer(api).listen(port, async () => {
  logger.info(`Server started on port ${port}...`);
});
