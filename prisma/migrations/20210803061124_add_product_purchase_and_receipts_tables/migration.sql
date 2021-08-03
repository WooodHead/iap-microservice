-- CreateTable
CREATE TABLE `purchases` (
    `id` VARCHAR(191) NOT NULL,
    `receiptId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191),
    `originalPurchaseId` VARCHAR(191),
    `linkedPurchaseId` VARCHAR(191),
    `userId` VARCHAR(255),
    `orderId` VARCHAR(255),
    `originalOrderId` VARCHAR(255),
    `linkedOrderId` VARCHAR(255),
    `purchaseDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `price` INTEGER NOT NULL DEFAULT 0,
    `currency` VARCHAR(3) NOT NULL,
    `convertedPrice` INTEGER NOT NULL DEFAULT 0,
    `convertedCurrency` VARCHAR(3) NOT NULL,
    `receiptDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `refundDate` DATETIME(3),
    `refundReason` VARCHAR(20),
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
    `isSubscriptionPaused` BOOLEAN,
    `subscriptionPeriodType` VARCHAR(6),
    `subscriptionState` VARCHAR(12),
    `subscriptionStatus` VARCHAR(12),
    `subscriptionGroup` VARCHAR(255),
    `subscriptionRenewalProductSku` VARCHAR(255),
    `cancellationReason` VARCHAR(23),
    `expirationDate` DATETIME(3),
    `gracePeriodEndDate` DATETIME(3),
    `token` TEXT,
    `linkedToken` TEXT,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `modifiedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `purchases.orderId_unique`(`orderId`),
    INDEX `purchases.userId_index`(`userId`),
    INDEX `purchases.orderId_index`(`orderId`),
    INDEX `purchases.originalOrderId_index`(`originalOrderId`),
    INDEX `purchases.linkedOrderId_index`(`linkedOrderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `receipts` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(255),
    `platform` VARCHAR(7) NOT NULL,
    `hash` CHAR(32) NOT NULL,
    `token` TEXT NOT NULL,
    `data` JSON NOT NULL,
    `receiptDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `modifiedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `receipts.hash_unique`(`hash`),
    INDEX `receipts.userId_index`(`userId`),
    INDEX `receipts.hash_index`(`hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` VARCHAR(191) NOT NULL,
    `skuAndroid` VARCHAR(255),
    `skuIOS` VARCHAR(255),
    `price` INTEGER NOT NULL DEFAULT 0,
    `currency` VARCHAR(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `modifiedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `products.skuAndroid_unique`(`skuAndroid`),
    UNIQUE INDEX `products.skuIOS_unique`(`skuIOS`),
    INDEX `products.skuAndroid_index`(`skuAndroid`),
    INDEX `products.skuIOS_index`(`skuIOS`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `purchases` ADD FOREIGN KEY (`receiptId`) REFERENCES `receipts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchases` ADD FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchases` ADD FOREIGN KEY (`originalPurchaseId`) REFERENCES `purchases`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchases` ADD FOREIGN KEY (`linkedPurchaseId`) REFERENCES `purchases`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
