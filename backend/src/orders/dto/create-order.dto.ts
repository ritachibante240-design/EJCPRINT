import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  externalReference!: string;

  @IsString()
  customerName!: string;

  @IsString()
  customerPhone!: string;

  @IsString()
  service!: string;

  @Transform(({ value }) => Number(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  pageCount!: number;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  copyCount!: number;

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  doubleSided = false;

  @IsOptional()
  @IsString()
  bindingType?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  bindingPrice?: number;
}
