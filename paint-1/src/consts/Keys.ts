// src/consts/Keys.ts

// 1. Tên các Màn chơi (Scene)
export enum SceneKeys {
    Preload = 'PreloadScene',
    Scene1 = 'Scene1',
    EndGame = 'EndGameScene',
    UI = 'UIScene'
}

// 2. Tên các Hình ảnh (Texture)
export enum TextureKeys {
    // --- UI Dùng Chung ---
    BtnExit = 'btn_exit',
    BtnReset = 'btn_reset',
    BtnEraser = 'btn_eraser',
    HandHint = 'hand_hint',

    // --- Scene 1 ---
    S1_Banner = 'banner_s2',
    S1_BannerText = 'text_banner_s2',
    S1_Board = 'board_s2',
    
    S1_Outline = 'outline',
    S1_1 = '1',
    S1_2 = '2',
    S1_3 = '3',
    S1_4 = '4',

    // Các nút màu Scene 1 (Formerly S2 Colors)
    BtnS1_1 = 's1_btn_1',
    BtnS1_2 = 's1_btn_2',
    BtnS1_3 = 's1_btn_3',
    BtnS1_4 = 's1_btn_4',
    BtnS1_5 = 's1_btn_5',
    BtnS1_6 = 's1_btn_6',
    BtnS1_7 = 's1_btn_7',

    // --- End Game ---
    End_Icon = 'icon_end',
    End_BannerCongrat = 'banner_congrat'
}

// 3. Tên Âm thanh (Audio)
export enum AudioKeys {
    BgmNen = 'bgm-nen'
}

// 4. Tên File Data (JSON)
export enum DataKeys {
    LevelS1Config = 'level_1_config'
}