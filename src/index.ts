import bodyParser from "body-parser";
import cors from "cors";
import express from "express";
import * as http from "http";

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
  const apple = new Apple(process.env.APPLE_SHARED_SECRET);

  const receipt = await apple.validate(req.body.token);
  const purchase = apple.processPurchase(receipt, req.body.token);

  res.send(purchase);
});

http.createServer(api).listen(port, async () => {
  console.log("Server started...");
});
