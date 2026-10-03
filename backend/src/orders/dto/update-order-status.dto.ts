import { IsIn } from 'class-validator';
import { orderStatuses, type OrderStatus } from '../order-status';

export class UpdateOrderStatusDto {
  @IsIn(orderStatuses)
  status!: OrderStatus;
}
