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

export enum FavoriteMediaType {
  MOVIE = 'movie',
  TV = 'tv',
  ANIME = 'anime',
}

export enum FavoriteSource {
  TMDB = 'tmdb',
  ANILIST = 'anilist',
  TVDB = 'tvdb',
}

@Entity()
@Unique('UQ_favorite_user_media_source', ['userId', 'mediaId', 'source'])
export class Favorite {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column()
  public userId: number;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @Index()
  public user: User;

  @Column()
  public mediaId: number;

  @Column({ type: 'varchar' })
  public mediaType: FavoriteMediaType;

  @Column({ type: 'varchar' })
  public source: FavoriteSource;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @UpdateDateColumn({
    type: resolveDbType('datetime'),
    default: () => 'CURRENT_TIMESTAMP',
  })
  public updatedAt: Date;

  constructor(init?: Partial<Favorite>) {
    Object.assign(this, init);
  }
}
