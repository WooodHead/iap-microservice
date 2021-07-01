import { PrismaClient } from "@prisma/client";
import bodyParser from "body-parser";
import cors from "cors";
import express from "express";
import * as http from "http";

const prisma = new PrismaClient();
import Apple from "./providers/Apple";

const port = process.env.PORT || 8080;

const api = express();
api.use(cors());
api.use(bodyParser.json({ limit: "5mb" }));

api.post("/validate", async (req, res) => {
  const apple = new Apple(process.env.APPLE_SHARED_SECRET);

  const result = await apple.validate(req.body.token);

  res.send(result);
});

api.post("/purchase", async (req, res) => {
  try {
    const apple = new Apple(process.env.APPLE_SHARED_SECRET);

    const receipt = await apple.validate(req.body.token);
    const purchases = apple.parseReceipt(receipt);
    purchases.reverse();
    for (const purchase of purchases) {
      purchase.token = req.body.token;
      if (req.body.userId) {
        purchase.userId = req.body.userId;
      }

      let dbPurchase = await prisma.purchase.findUnique({
        where: {
          orderId: purchase.orderId,
        },
      });

      if (
        purchase.originalOrderId &&
        purchase.orderId != purchase.originalOrderId
      ) {
        const originalPurchase = await prisma.purchase.findUnique({
          where: {
            orderId: purchase.originalOrderId,
          },
        });
        const linkedPurchase = await prisma.purchase.findFirst({
          where: {
            originalOrderId: purchase.originalOrderId,
            orderId: {
              not: purchase.orderId,
            },
            purchaseDate: {
              lt: purchase.purchaseDate,
            },
          },
          orderBy: {
            purchaseDate: "desc",
          },
        });
        if (originalPurchase) {
          purchase.originalPurchaseId = originalPurchase.id;
        }
        if (linkedPurchase) {
          purchase.linkedPurchaseId = linkedPurchase.id;
        }
      }

      if (!dbPurchase) {
        dbPurchase = await prisma.purchase.create({
          data: purchase,
        });
      } else {
        // Only reprocess this purchase is the current receipt is from before
        // the one we have on file
        if (dbPurchase.receiptDate > purchase.receiptDate) {
          dbPurchase = await prisma.purchase.update({
            where: {
              id: dbPurchase.id,
            },
            data: purchase,
          });
        }
      }
    }

    res.send(purchases.pop());
  } catch (e) {
    console.error(e);
    res.status(500);
    res.send(e.message);
  }
});

http.createServer(api).listen(port, async () => {
  console.log("Server started...");
});
