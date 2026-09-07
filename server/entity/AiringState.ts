import { DbAwareColumn, resolveDbType } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Last-known aired-episode state per show, shared across all users tracking
 * it (DAN-47). The poll job diffs upstream schedules against this row: a
 * missing row seeds the baseline silently (never notifies on first run),
 * and only a strictly newer aired episode fans out pushes.
 */
@Entity()
@Unique('UQ_airingstate_item', ['tmdbId', 'mediaType'])
export class AiringState {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column()
  @Index()
  public tmdbId: number;

  @Column({ type: 'varchar' })
  public mediaType: string;

  @Column({ type: 'int', nullable: true })
  public lastSeason: number | null;

  @Column({ type: 'int', nullable: true })
  public lastEpisode: number | null;

  @DbAwareColumn({ type: 'datetime', nullable: true })
  public lastAiredAt?: Date | null;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @UpdateDateColumn({
    type: resolveDbType('datetime'),
    default: () => 'CURRENT_TIMESTAMP',
  })
  public updatedAt: Date;

  constructor(init?: Partial<AiringState>) {
    Object.assign(this, init);
  }
}
