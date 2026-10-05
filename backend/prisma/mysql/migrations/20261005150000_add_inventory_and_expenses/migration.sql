CREATE TABLE `StockItem` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `normalizedName` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `quantity` DOUBLE NOT NULL DEFAULT 0,
    `minimumQuantity` DOUBLE NOT NULL DEFAULT 0,
    `averageUnitCost` DOUBLE NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `StockItem_normalizedName_key`(`normalizedName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `StockMovement` (
    `id` VARCHAR(191) NOT NULL,
    `externalReference` VARCHAR(191) NULL,
    `stockItemId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `quantity` DOUBLE NOT NULL,
    `amountCents` INTEGER NULL,
    `unitCost` DOUBLE NULL,
    `reason` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `StockMovement_externalReference_key`(`externalReference`),
    INDEX `StockMovement_stockItemId_createdAt_idx`(`stockItemId`, `createdAt`),
    INDEX `StockMovement_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `StockMovement_stockItemId_fkey` FOREIGN KEY (`stockItemId`) REFERENCES `StockItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `StockMovement_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Expense` (
    `id` VARCHAR(191) NOT NULL,
    `externalReference` VARCHAR(191) NULL,
    `description` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `amountCents` INTEGER NOT NULL,
    `stockMovementId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `Expense_externalReference_key`(`externalReference`),
    UNIQUE INDEX `Expense_stockMovementId_key`(`stockMovementId`),
    INDEX `Expense_createdAt_idx`(`createdAt`),
    INDEX `Expense_type_createdAt_idx`(`type`, `createdAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `Expense_stockMovementId_fkey` FOREIGN KEY (`stockMovementId`) REFERENCES `StockMovement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
