export type CompareMode = 'LESS' | 'MORE';

export interface LevelConfig {
    id: number;
    leftCount: number;
    rightCount: number;
    mode: CompareMode;
}
