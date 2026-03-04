// src/consts/Keys.ts

// 1. Tên các Màn chơi (Scene)
export enum SceneKeys {
    Preload = 'PreloadScene',
    IntroScene = 'IntroScene',
    SpeakScene = 'SpeakScene',
    UnderlineScene = 'UnderlineCharScene',
    EndGame = 'EndGameScene'
}

// 2. Tên các Hình ảnh (Texture)
export enum TextureKeys {
    // --- UI Dùng Chung ---
    BtnReset = 'btn_reset',
    HandHint = 'hand_hint',
    Hand = 'hand',
    S1_Board = 'board',
    Speak_Banner = 'speak_banner',

    // --- SpeakScene: Hình tàu hỏa ---
    Train_1 = 'train_1',       // 1 toa
    Train_2 = 'train_2',       // 2 toa
    Train_3 = 'train_3',       // 3 toa
    Train_4 = 'train_4',       // 4 toa
    Train_5 = 'train_5',       // 5 toa

    // --- SpeakScene: UI ---
    Speak_Speaker = 'speak_speaker',
    Speak_Micro = 'speak_micro',
    Speak_AniSpeak1 = 'ani_speak1',
    Speak_AniSpeak2 = 'ani_speak2',
    Speak_AniSpeak3 = 'ani_speak3',

    // --- UnderlineScene ---
    Underline_Banner = 'underline_banner',

    // --- Ảnh Điểm Số ---
    Score_4 = 'score_4',
    Score_5 = 'score_5',
    Score_6 = 'score_6',
    Score_7 = 'score_7',
    Score_8 = 'score_8',
    Score_9 = 'score_9',
    Score_10 = 'score_10',

    // --- Nút UI ---
    Ui_Mic = 'ui_mic',
    Ui_Speaker = 'ui_speaker',
    Ui_Score = 'ui_score',
}

// 3. Tên các Audio
export enum AudioKeys {
    BgmNen = 'bgm-nen'
}

// 4. Tên các Data JSON (nếu cần)
export enum DataKeys {
    LevelConfig = 'level_config'
}
