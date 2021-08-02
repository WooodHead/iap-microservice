import { PrismaClient } from "@prisma/client";

import { Purchase, Receipt } from "../types";
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

  async getPurchaseById(id: string): Promise<Purchase> {
    const purchase = await this.prisma.purchase.findUnique({
      where: {
        id,
      },
    });

    return purchase as Purchase;
  }

  async getPurchasesByUserId(userId: string): Promise<Purchase[]> {
    const purchases = await this.prisma.purchase.findMany({
      where: {
        userId,
      },
      orderBy: {
        purchaseDate: "desc",
      },
    });

    return purchases as Purchase[];
  }

  async getPurchaseByOrderId(orderId: string): Promise<Purchase> {
    const purchase = await this.prisma.purchase.findUnique({
      where: {
        orderId: orderId,
      },
    });

    return purchase as Purchase;
  }

  async getPurchasesByReceiptHash(hash: string): Promise<Purchase[]> {
    const purchases = await this.prisma.purchase.findMany({
      where: {
        receipt: {
          hash,
        },
      },
      orderBy: {
        purchaseDate: "desc",
      },
    });

    return purchases as Purchase[];
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

  async getReceiptById(id: string): Promise<Receipt> {
    return (await this.prisma.receipt.findUnique({
      where: {
        id: id,
      },
    })) as Receipt;
  }

  async getReceiptsByUserId(userId: string): Promise<Receipt[]> {
    return (await this.prisma.receipt.findMany({
      where: {
        userId,
      },
      orderBy: {
        receiptDate: "desc",
      },
    })) as Receipt[];
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
