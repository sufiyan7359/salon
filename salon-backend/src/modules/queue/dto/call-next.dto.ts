import { IsOptional, IsUUID } from 'class-validator';

export class CallNextDto {
  @IsOptional()
  @IsUUID()
  staffId?: string;
}
