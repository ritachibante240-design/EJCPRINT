import { IsIn, IsNotEmpty, IsNumber, IsString, MaxLength, Min } from 'class-validator';

export class CreateExpenseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  externalReference!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  description!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  category!: string;

  @IsIn(['COMPRA_STOCK', 'DESPESA_OPERACIONAL', 'OUTRO'])
  type!: 'COMPRA_STOCK' | 'DESPESA_OPERACIONAL' | 'OUTRO';

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(1)
  amountCents!: number;
}
