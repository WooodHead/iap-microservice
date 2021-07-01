-- CreateTable
CREATE TABLE `purchases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `linkedPurchaseId` INTEGER,
    `originalPurchaseId` INTEGER,
    `userId` VARCHAR(255),
    `orderId` VARCHAR(255),
    `originalOrderId` VARCHAR(255),
    `purchaseDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `receiptDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `refundDate` DATETIME(3),
    `refundReason` VARCHAR(255),
    `isRefunded` BOOLEAN NOT NULL DEFAULT false,
    `isSandbox` BOOLEAN NOT NULL DEFAULT false,
    `productSku` VARCHAR(255) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 0,
    `platform` VARCHAR(7) NOT NULL,
    `isTrial` BOOLEAN,
    `isTrialConversion` BOOLEAN,
    `isIntroOfferPeriod` BOOLEAN,
    `isSubscription` BOOLEAN NOT NULL DEFAULT false,
    `isSubscriptionActive` BOOLEAN,
    `isSubscriptionRenewable` BOOLEAN,
    `isSubscriptionRetryPeriod` BOOLEAN,
    `isSubscriptionGracePeriod` BOOLEAN,
    `subscriptionPeriodType` VARCHAR(255),
    `subscriptionState` VARCHAR(255),
    `subscriptionGroup` VARCHAR(255),
    `cancellationReason` VARCHAR(255),
    `expirationDate` DATETIME(3),
    `gracePeriodEndDate` DATETIME(3),
    `token` TEXT,
    `linkedToken` TEXT,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `modifiedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `purchases.orderId_unique`(`orderId`),
    INDEX `purchases.originalOrderId_index`(`originalOrderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `purchases` ADD FOREIGN KEY (`linkedPurchaseId`) REFERENCES `purchases`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchases` ADD FOREIGN KEY (`originalPurchaseId`) REFERENCES `purchases`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
