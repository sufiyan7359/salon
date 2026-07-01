import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  findById(id: string) {
    return this.usersRepository.findOne({ where: { id } });
  }

  findByPhoneNumber(phoneNumber: string) {
    return this.usersRepository.findOne({ where: { phoneNumber } });
  }

  findByEmailWithPassword(email: string) {
    return this.usersRepository.findOne({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phoneNumber: true,
        passwordHash: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  countByRole(role: UserRole) {
    return this.usersRepository.count({ where: { role } });
  }

  createCustomer(phoneNumber: string, name?: string) {
    const user = this.usersRepository.create({
      phoneNumber,
      name: name ?? null,
      role: UserRole.CUSTOMER,
    });
    return this.usersRepository.save(user);
  }

  createOwner(email: string, name: string, passwordHash: string) {
    const user = this.usersRepository.create({
      email,
      name,
      passwordHash,
      role: UserRole.OWNER,
    });
    return this.usersRepository.save(user);
  }
}
