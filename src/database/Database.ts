import { Platform, Product, Purchase, Receipt } from "../types";

export interface Database {
  getPurchaseById(id: string): Promise<Purchase>;
  getPurchaseByOrderId(orderId: string): Promise<Purchase>;
  getPurchasesByReceiptHash(hash: string): Promise<Purchase[]>;
  createPurchase(purchase: Purchase): Promise<Purchase>;
  updatePurchase(id: string, purchase: Purchase): Promise<Purchase>;
  getUserId(orderIds: string[]): Promise<string | null>;
  syncUserId(oldUserId: string, newUserId: string): Promise<void>;
  getPurchasesByUserId(userId: string): Promise<Purchase[]>;
  getPurchasesByOriginalPurchaseId(
    userId: string,
    originalPurchaseId: string
  ): Promise<Purchase[]>;

  getReceiptById(id: string): Promise<Receipt>;
  getReceiptByHash(hash: string): Promise<Receipt>;
  createReceipt(receipt: Receipt): Promise<Receipt>;
  updateReceipt(receipt: Receipt): Promise<Receipt>;
  getReceiptsByUserId(userId: string): Promise<Receipt[]>;

  getProductBySku(sku: string, platform: Platform): Promise<Product>;
  getProductById(id: string): Promise<Product>;
  createProduct(product: Product): Promise<Product>;
  updateProduct(product: Product): Promise<Product>;
}
