import { DbAwareColumn, resolveDbType } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './User';

@Entity()
@Unique('UQ_watchedstatus_user_jellyfin', ['userId', 'jellyfinItemId'])
export class WatchedStatus {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column()
  public userId: number;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @Index()
  public user: User;

  @Column()
  public jellyfinItemId: string;

  @Column()
  public mediaId: number;

  @DbAwareColumn({ type: 'datetime', nullable: true })
  public watchedAt: Date | null;

  @Column({ type: 'float', default: 0 })
  public progress: number;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @UpdateDateColumn({
    type: resolveDbType('datetime'),
    default: () => 'CURRENT_TIMESTAMP',
  })
  public updatedAt: Date;

  constructor(init?: Partial<WatchedStatus>) {
    Object.assign(this, init);
  }
}
