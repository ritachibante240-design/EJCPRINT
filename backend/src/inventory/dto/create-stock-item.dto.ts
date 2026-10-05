import { IsNotEmpty, IsNumber, IsString, MaxLength, Min } from 'class-validator';

export class CreateStockItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  externalReference!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  category!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  unit!: string;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  quantity!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  minimumQuantity!: number;
}
