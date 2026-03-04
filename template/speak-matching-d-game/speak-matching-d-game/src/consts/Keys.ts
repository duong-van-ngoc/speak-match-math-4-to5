// src/consts/Keys.ts

// 1. Tên các Màn chơi (Scene)
export const enum SceneKeys {
    Preload = 'PreloadScene',
    SpeakScene = 'SpeakScene',
    UnderlineScene = 'UnderlineCharScene',
    EndGame = 'EndGameScene'
}

// 2. Tên các Hình ảnh (Texture)
export enum TextureKeys {
    // --- UI Dùng Chung ---
    BtnExit = 'btn_exit',
    BtnReset = 'btn_reset',
    BgPopup = 'bg_popup',
    HandHint = 'hand_hint',
    S1_Board = 'board_white',

    // --- SpeakScene ---
    Speak_Banner = 'speak_banner',
    Speak_Title = 'speak_title',
    Speak_Content = 'speak_content',
    Speak_Illustration = 'speak_illustration',
    Speak_Speaker = 'speak_speaker',
    Speak_Micro = 'speak_micro',
    Speak_SmileD = 'speak_smile_d',
    Speak_AniSpeak1 = 'ani_speak1',
    Speak_AniSpeak2 = 'ani_speak2',
    Speak_AniSpeak3 = 'ani_speak3',

    // --- UnderlineCharScene ---
    Underline_Banner = 'underline_banner',
    Underline_ItemWatermelon = 'item_watermelon',
    Underline_ItemCoconut = 'item_coconut',
    Underline_ItemStrawberry = 'item_strawberry',
    Underline_TextWatermelon = 'text_watermelon',
    Underline_TextWatermelon_Correct = 'text_watermelon_correct',
    Underline_TextCoconut = 'text_coconut',
    Underline_TextCoconut_Correct = 'text_coconut_correct',
    Underline_TextStrawberry = 'text_strawberry',
    Underline_TextStrawberry_Correct = 'text_strawberry_correct',

    // --- End Game ---
    End_Icon = 'icon_end',
    End_BannerCongrat = 'banner_congrat',

    // --- Score Images ---
    Score_4 = 'score_4',
    Score_5 = 'score_5',
    Score_6 = 'score_6',
    Score_7 = 'score_7',
    Score_8 = 'score_8',
    Score_9 = 'score_9',
    Score_10 = 'score_10'
}

// 3. Tên các Audio
export enum AudioKeys {
    BgmNen = 'bgm-nen'
}

// 4. Tên các Data JSON (nếu cần)
export enum DataKeys {
    LevelConfig = 'level_config'
}