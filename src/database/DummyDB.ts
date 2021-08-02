/* eslint-disable @typescript-eslint/no-unused-vars */
import { Purchase, Receipt } from "../types";
import { Database } from "./Database";

export class DummyDB implements Database {
  createPurchase(purchase: Purchase): Promise<Purchase> {
    return Promise.resolve(purchase);
  }

  getPurchaseByOrderId(orderId: string): Promise<Purchase> {
    return Promise.resolve(null);
  }

  getPurchasesByReceiptHash(hash: string): Promise<Purchase[]> {
    return Promise.resolve([]);
  }

  updatePurchase(id: string, purchase: Purchase): Promise<Purchase> {
    return Promise.resolve(purchase);
  }

  getUserId(orderIds: string[]): Promise<string | null> {
    return Promise.resolve(null);
  }

  syncUserId(oldUserId: string, newUserId: string): Promise<void> {
    return Promise.resolve();
  }

  createReceipt(receipt: Receipt): Promise<Receipt> {
    return Promise.resolve(receipt);
  }

  getReceiptByHash(hash: string): Promise<Receipt> {
    return Promise.resolve(null);
  }

  updateReceipt(receipt: Receipt): Promise<Receipt> {
    return Promise.resolve(receipt);
  }

  getPurchaseById(id: string): Promise<Purchase> {
    return Promise.resolve(null);
  }

  getPurchasesByUserId(userId: string): Promise<Purchase[]> {
    return Promise.resolve([]);
  }

  getReceiptById(id: string): Promise<Receipt> {
    return Promise.resolve(null);
  }

  getReceiptsByUserId(userId: string): Promise<Receipt[]> {
    return Promise.resolve([]);
  }
}
