import bodyParser from "body-parser";
import cors from "cors";
import crypto from "crypto";
import express from "express";
import * as http from "http";
import { AppleVerifyReceiptResponseBodySuccess } from "types-apple-iap";

import { Platform } from "../types";
import db from "./database";
import { getProvider } from "./providers";

const port = process.env.PORT || 8080;

const api = express();
api.use(cors());
api.use(bodyParser.json({ limit: "5mb" }));

api.post("/validate", async (req, res) => {
  const provider = getProvider(req.body.platform);
  const result = await provider.validate(req.body.token);

  res.send(result);
});

api.post("/purchase", async (req, res) => {
  try {
    // Params:
    // token - Apple/Google purchase token
    // import - Optional flag to import ALL purchases from this receipt (including those newer than the original receipt).
    // userId - Optional user ID to put against this purchase.
    //  If not supplied, will attempt to find user id from previous purchase
    // syncUserId - All related purchases will be changed to this user id. Useful if userId changes for some reason

    let userId = req.body.userId || null;
    const includeNewer = !!req.body.import;
    const syncUserId = !!req.body.syncUserId;
    const token = req.body.token;
    const platform = req.body.platform as Platform;

    const provider = getProvider(req.body.platform);

    const receipt = await provider.validate(token);
    const purchases = provider.parseReceipt(
      receipt as AppleVerifyReceiptResponseBodySuccess,
      includeNewer
    );

    // If userId was not passed, lookup user ID from past purchases,
    // if it was, check that it matches what we have on file.
    // If it doesn't match, update all existing purchases with the new userId
    const existingUserId = await db.getUserId(
      purchases.map((item) => item.orderId)
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

    const hash = crypto.createHash("md5").update(token).digest("hex");
    let dbReceipt = await db.getReceiptByHash(hash);
    if (!dbReceipt) {
      dbReceipt = await db.createReceipt({
        hash,
        token,
        userId,
        platform,
        data: receipt,
      });
    } else {
      if (userId) {
        dbReceipt.userId = userId;
      }
      dbReceipt = await db.updateReceipt(dbReceipt);
    }

    // parseReceipt will return purchases sorted desc. Reverse them so we save them
    // in chronological order allowing linked and original purchase links to be established
    purchases.reverse();
    let returnPurchase = null;
    for (const purchase of purchases) {
      purchase.receiptId = dbReceipt.id;
      if (userId) {
        purchase.userId = userId;
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
        if (dbPurchase.receiptDate > purchase.receiptDate) {
          dbPurchase = await db.updatePurchase(dbPurchase.id, purchase);
        }
      }

      returnPurchase = dbPurchase;
    }

    res.send(returnPurchase);
  } catch (e) {
    console.error(e);
    res.status(500);
    res.send(e.message);
  }
});

http.createServer(api).listen(port, async () => {
  console.log("Server started...");
});
