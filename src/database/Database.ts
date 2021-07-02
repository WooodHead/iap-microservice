import { Purchase, Receipt } from "../../types";

export interface Database {
  getPurchaseByOrderId(orderId: string): Promise<Purchase>;
  createPurchase(purchase: Purchase): Promise<Purchase>;
  updatePurchase(id: string, purchase: Purchase): Promise<Purchase>;
  getUserId(orderIds: string[]): Promise<string | null>;
  syncUserId(oldUserId: string, newUserId: string): Promise<void>;

  getReceiptByHash(hash: string): Promise<Receipt>;
  createReceipt(receipt: Receipt): Promise<Receipt>;
  updateReceipt(receipt: Receipt): Promise<Receipt>;
}
