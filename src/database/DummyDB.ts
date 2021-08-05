/* eslint-disable @typescript-eslint/no-unused-vars */
import { Platform, Product, Purchase, Receipt } from "../types";
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

  getPurchasesByOriginalPurchaseId(
    userId: string,
    originalPurchaseId: string
  ): Promise<Purchase[]> {
    return Promise.resolve([]);
  }

  getLatestPurchaseByOriginalOrderId(
    originalOrderId: string
  ): Promise<Purchase> {
    return Promise.resolve(undefined);
  }

  getPurchasesToRefresh(): Promise<Purchase[]> {
    return Promise.resolve([]);
  }

  getReceiptById(id: string): Promise<Receipt> {
    return Promise.resolve(null);
  }

  getReceiptsByUserId(userId: string): Promise<Receipt[]> {
    return Promise.resolve([]);
  }

  createProduct(product: Product): Promise<Product> {
    return Promise.resolve(product);
  }

  getProductById(id: string): Promise<Product> {
    return Promise.resolve(null);
  }

  getProductBySku(sku: string, platform: Platform): Promise<Product> {
    return Promise.resolve(null);
  }

  updateProduct(product: Product): Promise<Product> {
    return Promise.resolve(product);
  }

  addIncomingNotification(platform: string, data: any): Promise<void> {
    return Promise.resolve();
  }
}
