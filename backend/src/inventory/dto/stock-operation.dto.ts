import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class StockOperationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  externalReference!: string;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  reason?: string;
}

export class PurchaseStockDto extends StockOperationDto {
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(1)
  amountCents!: number;
}

export class AdjustStockDto extends StockOperationDto {
  @IsIn(['ADD', 'REMOVE', 'SET'])
  direction!: 'ADD' | 'REMOVE' | 'SET';
}

export class InitialStockCostDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  externalReference!: string;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(1)
  amountCents!: number;
}

export class StartPrintDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  externalReference!: string;
}

export class ApplyPrintCostDefaultsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  externalReference!: string;
}

export class WasteStockDto extends StockOperationDto {
  @IsOptional()
  @IsString()
  orderId?: string;
}
