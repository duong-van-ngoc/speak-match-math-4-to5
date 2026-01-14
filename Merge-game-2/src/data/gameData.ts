    export type GameData = {
    maxNumber: number;        // 3 hoặc 5 tuỳ bài
    marblesBags: [number, number];
    ballsBags: [number, number];
    };

export const GAME_DATA: GameData = {
    maxNumber: 5,
    marblesBags: [1, 2], // tổng 3
    ballsBags: [1, 1],   // tổng 2
};

    export const COLORS = {
    red: 0xff3b30,
    yellow: 0xffcc00,
    blue: 0x2f6cff,
    okGreen: 0x12b76a,
    wrong: 0xff4d4f,
    };
