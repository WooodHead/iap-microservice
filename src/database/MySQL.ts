import { PrismaClient } from "@prisma/client";

import { Purchase, Receipt } from "../../types";
import { Database } from "./Database";

export class MySQL implements Database {
  prisma: PrismaClient = null;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async createPurchase(purchase: Purchase): Promise<Purchase> {
    return (await this.prisma.purchase.create({
      data: purchase,
    })) as Purchase;
  }

  async getPurchaseByOrderId(orderId: string): Promise<Purchase> {
    const purchase = await this.prisma.purchase.findUnique({
      where: {
        orderId: orderId,
      },
    });

    return purchase as Purchase;
  }

  async updatePurchase(id: string, purchase: Purchase): Promise<Purchase> {
    return (await this.prisma.purchase.update({
      where: {
        id,
      },
      data: purchase,
    })) as Purchase;
  }

  async getUserId(orderIds: string[]): Promise<string | null> {
    const purchase = await this.prisma.purchase.findFirst({
      where: {
        userId: {
          not: null,
        },
        orderId: {
          in: orderIds,
        },
      },
      orderBy: {
        purchaseDate: "desc",
      },
    });

    return purchase ? purchase.userId : null;
  }

  async syncUserId(oldUserId: string, newUserId: string): Promise<void> {
    await this.prisma.purchase.updateMany({
      where: {
        userId: oldUserId,
      },
      data: {
        userId: newUserId,
      },
    });

    await this.prisma.receipt.updateMany({
      where: {
        userId: oldUserId,
      },
      data: {
        userId: newUserId,
      },
    });
  }

  async getReceiptByHash(hash: string): Promise<Receipt> {
    return (await this.prisma.receipt.findUnique({
      where: {
        hash: hash,
      },
    })) as Receipt;
  }

  async createReceipt(receipt: Receipt): Promise<Receipt> {
    return (await this.prisma.receipt.create({
      data: receipt,
    })) as Receipt;
  }

  async updateReceipt(receipt: Receipt): Promise<Receipt> {
    return (await this.prisma.receipt.update({
      where: {
        id: receipt.id,
      },
      data: receipt,
    })) as Receipt;
  }
}
