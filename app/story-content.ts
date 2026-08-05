import type { ChapterFlowDefinition } from "./chapter-flow-manager";
import type { InteractionDialogueScript } from "./interaction-flow";

/* CHAPTER_SCRIPT_EDITOR_DATA_BEGIN
ew0KICAic2NoZW1hVmVyc2lvbiI6IDIsDQogICJjaGFwdGVycyI6IFsNCiAgICB7DQogICAgICAiaWQiOiAicHJvbG9ndWUiLA0KICAgICAgInRhYk5hbWUiOiAi5bqP56ugIiwNCiAgICAgICJ0aXRsZSI6ICLkurrpoZ7nmoTluIzmnJsiLA0KICAgICAgImNoYXB0ZXJOdW1iZXIiOiAwLA0KICAgICAgInN1YnRpdGxlRXZlbnRzIjogW10sDQogICAgICAiZGlhbG9ndWVTZWN0aW9ucyI6IFtdLA0KICAgICAgInN0b3J5VHJpZ2dlckRpYWxvZ3VlcyI6IFtdDQogICAgfSwNCiAgICB7DQogICAgICAiaWQiOiAiY2hhcHRlcjAyIiwNCiAgICAgICJ0YWJOYW1lIjogIuesrOS6jOeroCIsDQogICAgICAidGl0bGUiOiAi56qB5aaC5YW25L6G55qE5oSP5aSWIiwNCiAgICAgICJjaGFwdGVyTnVtYmVyIjogMiwNCiAgICAgICJzdWJ0aXRsZUV2ZW50cyI6IFtdLA0KICAgICAgImRpYWxvZ3VlU2VjdGlvbnMiOiBbXSwNCiAgICAgICJzdG9yeVRyaWdnZXJEaWFsb2d1ZXMiOiBbXQ0KICAgIH0sDQogICAgew0KICAgICAgImlkIjogImNoYXB0ZXIwMyIsDQogICAgICAidGFiTmFtZSI6ICLnrKzkuInnq6AiLA0KICAgICAgInRpdGxlIjogIuWtmOa0u+eahOa6luWCmSIsDQogICAgICAiY2hhcHRlck51bWJlciI6IDMsDQogICAgICAic3VidGl0bGVFdmVudHMiOiBbDQogICAgICAgIHsNCiAgICAgICAgICAiaWQiOiAiY2hhcHRlcjAzLW9wZW5pbmctY2FyZCIsDQogICAgICAgICAgIm5hbWUiOiAi56ys5LiJ56ug6ZaL5aC05a2X5bmVIiwNCiAgICAgICAgICAidGV4dCI6ICLmmYLplpPvvJrlopzokL3lvoznrKwz5aSp77yM5riF5pmoXHJcbuWcsOm7nu+8mumjm+iIueaumOmquOaXgeeahOiHqOaZgueHn+WcsFxyXG7liY3mj5DvvJrouqvpq5ToiIfnsr7npZ7ni4DmhYvlsJrmnKrmgaLlvqnvvIznj77mnInoo5zntabljbPlsIfogJfnm6HvvIxcclxu5b+F6aCI6ZaL5aeL5bCL5om+56mp5a6a55qE6aOf54mp5L6G5rqQ77yM5ZCM5pmC5Yqg5Zu654ef5Zyw5Lim5qqi5L+u6Zu76IWm6IiH6YCa6KiK6Kit5YKZ44CCIiwNCiAgICAgICAgICAidHJpZ2dlclR5cGUiOiAiY2hhcHRlclN0YXJ0IiwNCiAgICAgICAgICAidHJpZ2dlclZhbHVlIjogIiIsDQogICAgICAgICAgInRyaWdnZXJDb3VudCI6IDEsDQogICAgICAgICAgImRlbGF5QmVmb3JlTXMiOiAyMDAwLA0KICAgICAgICAgICJmYWRlSW5NcyI6IDE1MDAsDQogICAgICAgICAgImhvbGRNcyI6IDgwMDAsDQogICAgICAgICAgImZhZGVPdXRNcyI6IDE1MDAsDQogICAgICAgICAgImRlbGF5QWZ0ZXJNcyI6IDE1MDAsDQogICAgICAgICAgImtlZXBCbGFjayI6IHRydWUsDQogICAgICAgICAgImxvY2tJbnB1dCI6IHRydWUNCiAgICAgICAgfQ0KICAgICAgXSwNCiAgICAgICJkaWFsb2d1ZVNlY3Rpb25zIjogWw0KICAgICAgICB7DQogICAgICAgICAgImlkIjogImNoYXB0ZXIwMy1zdGFydCIsDQogICAgICAgICAgIm5hbWUiOiAi56ys5LiJ56ugX1N0YXJ0IiwNCiAgICAgICAgICAiZGlhbG9ndWUiOiB7DQogICAgICAgICAgICAiY2hhcmFjdGVyRGVsYXlTZWNvbmRzIjogMC4wMiwNCiAgICAgICAgICAgICJzcGVha2VycyI6IFsNCiAgICAgICAgICAgICAgIlNiYWFrIiwNCiAgICAgICAgICAgICAgIj8/PyIsDQogICAgICAgICAgICAgICLpo5voiLnovJTliqnns7vntbEiLA0KICAgICAgICAgICAgICAiRWNobyINCiAgICAgICAgICAgIF0sDQogICAgICAgICAgICAibGluZXMiOiBbDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICIiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuiIueiJmeWFp+WCs+S+huS6huapn+aisOWVn+WLleeahOWWgOWZoOiBsu+8jOa3t+iRl+miqOmRvemAsuepuumameeahOiBsumfsy4uLiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIiIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi6YKE5pyJ5L2O5b6u55qE6Zu75rWB6Zuc6Z+z6IiH6YeR5bGs5p2/6ayG5YuV5LiN5pmC56Kw5pKe55qE6IGy6Z+/44CCIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiPz8/IiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICIuLi4uLi4iDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICLpo5voiLnovJTliqnns7vntbEiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuS6i+aVheW+jOaZgumWk+KApuKApuS6lOWNgeWFq+Wwj+aZgu+8jOS6jOWNgeS4gOWIhumQmOOAgiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIumjm+iIuei8lOWKqeezu+e1sSIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi55Sf5ZG954uA5oWL6KmV5Lyw77ya6LyV5bqm6ISr5rC044CB552h55yg5LiN6Laz77yMXG7lj7PlgbTogovpg6jmjKvlgrflsJrmnKrmgaLlvqnjgIIiDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICJTYmFhayIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi5oiR5oSf6Ka65b6X5Yiw44CC77yI6Lqr6auU55qE55a855eb5Zyo5o+Q6YaS6JGX5oiRLi4u77yJIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAi6aOb6Ii56LyU5Yqp57O757WxIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLlu7rorbAgLSDoq4vnubznuozkvJHmga/jgIIiDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICJTYmFhayIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi6Ii56ImZ5YWn55qE6aOf54mp5Y+q5Ymp5YWp5YyF77yM5rC05Lmf5pKQ5LiN5Yiw5piO5aSp44CCIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiU2JhYWsiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuWGjei6uuS4i+WOu++8jOaDheazgeS5n+S4jeacg+iHquW3seaUueWWhOOAgiINCiAgICAgICAgICAgICAgfQ0KICAgICAgICAgICAgXQ0KICAgICAgICAgIH0NCiAgICAgICAgfSwNCiAgICAgICAgew0KICAgICAgICAgICJpZCI6ICJjaGFwdGVyMDMtc2VjdGlvbi0xIiwNCiAgICAgICAgICAibmFtZSI6ICLnrKzkuInnq6BfU2VjdGlvbiAxIiwNCiAgICAgICAgICAiZGlhbG9ndWUiOiB7DQogICAgICAgICAgICAiY2hhcmFjdGVyRGVsYXlTZWNvbmRzIjogMC4wMiwNCiAgICAgICAgICAgICJzcGVha2VycyI6IFsNCiAgICAgICAgICAgICAgIlNiYWFrIiwNCiAgICAgICAgICAgICAgIkVjaG8iLA0KICAgICAgICAgICAgICAi6aOb6Ii56Zu76IWmIiwNCiAgICAgICAgICAgICAgIumjm+iIuei8lOWKqeezu+e1sSINCiAgICAgICAgICAgIF0sDQogICAgICAgICAgICAibGluZXMiOiBbDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICIiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuacqueGhOa7heeahOeHn+eBq+S7jeeHg+eHkuiRl+mkmOeHvO+8jOmjm+iIueaXgeaVo+iQveiRl+WHjOS6gueahOmHkeWxrOadv+OAgee3muadkOiIh+S4gOWghuaOieiQveeahOiyqOeuseOAgiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLlj6rmmK/og73nq5notbfkvobogIzlt7LigKbouqvpq5Tni4Dms4Hmr5TmmKjlpKnpgoTns5/jgIIiDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICLpo5voiLnovJTliqnns7vntbEiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuWBtea4rOWIsOermeeri+W5s+ihoeS4jeepqeWumuOAglxyXG7lho3mrKHlu7rorbDlgZzmraLmtLvli5XkuKbkv53mjIHkvJHmga/jgIIiDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICJTYmFhayIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi6Zec6ZaJ5YGl5bq35o+Q6YaS6YCa55+l44CCKOmAmeWAi0FJ55qE56mN5qW15bqm6Kit5a6a5b6X5aSq6auY5LqGKSINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIumjm+iIuei8lOWKqeezu+e1sSIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi5YGl5bq35o+Q6YaS5bey6ZmN5L2O6IezIC0g5b+F6KaB6K2m5ZGK44CCIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiU2JhYWsiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuW+iOWlve+8jOiHs+WwkeePvuWcqOmdnOS4gOm7nuS6hu+8jOipsuS+huWIl+aVtOS4gOS4i+S7iuWkqeimgeiZleeQhueahOS6i+mghS4uLiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLoiZnlpJbnmoTosqjnrrEuLi7lpb3lg4/pgoTlnKjvvIzopoHmqqLmn6XkuIDkuIvosqjniakuLi5cclxu6Iez5bCR6KaB5Y+W5Zue5LiA5Lqb57eK5oCl5Y+j57On6Lef5reo5rC0Li4u5pyJ5aSa5bCR5ou/5aSa5bCR44CCIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiU2JhYWsiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIumChOimgea4rOippuaYqOWkqeaetuWcqOWklumdoueahOWFieazouWFhembu+WZqO+8jOeci+iDveS4jeiDveWVn+WLlembu+iFpueahOWuieWFqOaooeW8jy4uLiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLnuL3kuYvlhYjlrozmiJDkuIDkupvpgLLluqblkKchIOS4jeeEtumAo+a0u+S4i+WOu+WPr+iDvemDveaYr+WAi+WVj+mhjC4uLiINCiAgICAgICAgICAgICAgfQ0KICAgICAgICAgICAgXQ0KICAgICAgICAgIH0NCiAgICAgICAgfQ0KICAgICAgXSwNCiAgICAgICJzdG9yeVRyaWdnZXJEaWFsb2d1ZXMiOiBbDQogICAgICAgIHsNCiAgICAgICAgICAiaWQiOiAiY2hhcHRlcjAzLWxvd2VyLWxlZnQtbm90LXJlYWR5IiwNCiAgICAgICAgICAibmFtZSI6ICLnrKzkuInnq6Bf5bem5LiL5YqH5oOF5Y2AX+Wwmuacqua6luWCmeWlvSIsDQogICAgICAgICAgImRpYWxvZ3VlIjogew0KICAgICAgICAgICAgImNoYXJhY3RlckRlbGF5U2Vjb25kcyI6IDAuMDIsDQogICAgICAgICAgICAic3BlYWtlcnMiOiBbDQogICAgICAgICAgICAgICJTYmFhayINCiAgICAgICAgICAgIF0sDQogICAgICAgICAgICAibGluZXMiOiBbDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICJTYmFhayIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi54++5Zyo5oiR6YKE5rKS5rqW5YKZ5aW944CCIg0KICAgICAgICAgICAgICB9DQogICAgICAgICAgICBdDQogICAgICAgICAgfQ0KICAgICAgICB9LA0KICAgICAgICB7DQogICAgICAgICAgImlkIjogImNoYXB0ZXIwM19iYWNrcGFjay10ZWFjaGluZyIsDQogICAgICAgICAgIm5hbWUiOiAi6IOM5YyF6IiH5L2/55So5pWZ5a24IiwNCiAgICAgICAgICAiZGlhbG9ndWUiOiB7DQogICAgICAgICAgICAiY2hhcmFjdGVyRGVsYXlTZWNvbmRzIjogMC4wMiwNCiAgICAgICAgICAgICJzcGVha2VycyI6IFsNCiAgICAgICAgICAgICAgIlNiYWFrIiwNCiAgICAgICAgICAgICAgIkVjaG8iDQogICAgICAgICAgICBdLA0KICAgICAgICAgICAgImxpbmVzIjogWw0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiU2JhYWsiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuWlve+8jOaUtumbhuWIsOS4gOm7nuWQg+eahOS6hu+8jOaciem7nue0ry4uLuaJk+mWi+iDjOWMheWWnem7nuawtOWQp+OAgiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIiIsDQogICAgICAgICAgICAgICAgInRleHQiOiAiKOaIkeWYl+ippue/u+aJvuiDjOWMheijoeaUtumbhuWIsOeahOWPo+ezp+iIh+mjsuawtCkiDQogICAgICAgICAgICAgIH0NCiAgICAgICAgICAgIF0NCiAgICAgICAgICB9DQogICAgICAgIH0NCiAgICAgIF0NCiAgICB9DQogIF0NCn0=
CHAPTER_SCRIPT_EDITOR_DATA_END */

// CHAPTER_SCRIPT_EDITOR_GENERATED_BEGIN
export const STORY_CHAPTERS =
[
  {
    "id": "prologue",
    "tabName": "序章",
    "title": "人類的希望",
    "chapterNumber": 0,
    "subtitleEvents": [],
    "dialogueSections": [],
    "storyTriggerDialogues": []
  },
  {
    "id": "chapter02",
    "tabName": "第二章",
    "title": "突如其來的意外",
    "chapterNumber": 2,
    "subtitleEvents": [],
    "dialogueSections": [],
    "storyTriggerDialogues": []
  },
  {
    "id": "chapter03",
    "tabName": "第三章",
    "title": "存活的準備",
    "chapterNumber": 3,
    "subtitleEvents": [
      {
        "id": "chapter03-opening-card",
        "name": "第三章開場字幕",
        "text": "時間：墜落後第3天，清晨\r\n地點：飛船殘骸旁的臨時營地\r\n前提：身體與精神狀態尚未恢復，現有補給即將耗盡，\r\n必須開始尋找穩定的食物來源，同時加固營地並檢修電腦與通訊設備。",
        "triggerType": "chapterStart",
        "triggerValue": "",
        "triggerCount": 1,
        "delayBeforeMs": 2000,
        "fadeInMs": 1500,
        "holdMs": 8000,
        "fadeOutMs": 1500,
        "delayAfterMs": 1500,
        "keepBlack": true,
        "lockInput": true
      }
    ],
    "dialogueSections": [
      {
        "id": "chapter03-start",
        "name": "第三章_Start",
        "dialogue": {
          "characterDelaySeconds": 0.02,
          "speakers": [
            "Sbaak",
            "???",
            "飛船輔助系統",
            "Echo"
          ],
          "lines": [
            {
              "speaker": "",
              "text": "船艙內傳來了機械啟動的喀噠聲，混著風鑽進空隙的聲音..."
            },
            {
              "speaker": "",
              "text": "還有低微的電流雜音與金屬板鬆動不時碰撞的聲響。"
            },
            {
              "speaker": "???",
              "text": "......"
            },
            {
              "speaker": "飛船輔助系統",
              "text": "事故後時間……五十八小時，二十一分鐘。"
            },
            {
              "speaker": "飛船輔助系統",
              "text": "生命狀態評估：輕度脫水、睡眠不足，\n右側肋部挫傷尚未恢復。"
            },
            {
              "speaker": "Sbaak",
              "text": "我感覺得到。（身體的疼痛在提醒著我...）"
            },
            {
              "speaker": "飛船輔助系統",
              "text": "建議 - 請繼續休息。"
            },
            {
              "speaker": "Sbaak",
              "text": "船艙內的食物只剩兩包，水也撐不到明天。"
            },
            {
              "speaker": "Sbaak",
              "text": "再躺下去，情況也不會自己改善。"
            }
          ]
        }
      },
      {
        "id": "chapter03-section-1",
        "name": "第三章_Section 1",
        "dialogue": {
          "characterDelaySeconds": 0.02,
          "speakers": [
            "Sbaak",
            "Echo",
            "飛船電腦",
            "飛船輔助系統"
          ],
          "lines": [
            {
              "speaker": "",
              "text": "未熄滅的營火仍燃燒著餘燼，飛船旁散落著凌亂的金屬板、線材與一堆掉落的貨箱。"
            },
            {
              "speaker": "Sbaak",
              "text": "只是能站起來而已…身體狀況比昨天還糟。"
            },
            {
              "speaker": "飛船輔助系統",
              "text": "偵測到站立平衡不穩定。\r\n再次建議停止活動並保持休息。"
            },
            {
              "speaker": "Sbaak",
              "text": "關閉健康提醒通知。(這個AI的積極度設定得太高了)"
            },
            {
              "speaker": "飛船輔助系統",
              "text": "健康提醒已降低至 - 必要警告。"
            },
            {
              "speaker": "Sbaak",
              "text": "很好，至少現在靜一點了，該來列整一下今天要處理的事項..."
            },
            {
              "speaker": "Sbaak",
              "text": "艙外的貨箱...好像還在，要檢查一下貨物...\r\n至少要取回一些緊急口糧跟淨水...有多少拿多少。"
            },
            {
              "speaker": "Sbaak",
              "text": "還要測試昨天架在外面的光波充電器，看能不能啟動電腦的安全模式..."
            },
            {
              "speaker": "Sbaak",
              "text": "總之先完成一些進度吧! 不然連活下去可能都是個問題..."
            }
          ]
        }
      }
    ],
    "storyTriggerDialogues": [
      {
        "id": "chapter03-lower-left-not-ready",
        "name": "第三章_左下劇情區_尚未準備好",
        "dialogue": {
          "characterDelaySeconds": 0.02,
          "speakers": [
            "Sbaak"
          ],
          "lines": [
            {
              "speaker": "Sbaak",
              "text": "現在我還沒準備好。"
            }
          ]
        }
      },
      {
        "id": "chapter03_backpack-teaching",
        "name": "背包與使用教學",
        "dialogue": {
          "characterDelaySeconds": 0.02,
          "speakers": [
            "Sbaak",
            "Echo"
          ],
          "lines": [
            {
              "speaker": "Sbaak",
              "text": "好，收集到一點吃的了，有點累...打開背包喝點水吧。"
            },
            {
              "speaker": "",
              "text": "(我嘗試翻找背包裡收集到的口糧與飲水)"
            }
          ]
        }
      }
    ]
  }
] as const;

export const STORY_DIALOGUES: Record<string, InteractionDialogueScript> = {
  "chapter03-start": {
  "characterDelaySeconds": 0.02,
  "speakers": [
    "Sbaak",
    "???",
    "飛船輔助系統",
    "Echo"
  ],
  "lines": [
    {
      "speaker": "",
      "text": "船艙內傳來了機械啟動的喀噠聲，混著風鑽進空隙的聲音..."
    },
    {
      "speaker": "",
      "text": "還有低微的電流雜音與金屬板鬆動不時碰撞的聲響。"
    },
    {
      "speaker": "???",
      "text": "......"
    },
    {
      "speaker": "飛船輔助系統",
      "text": "事故後時間……五十八小時，二十一分鐘。"
    },
    {
      "speaker": "飛船輔助系統",
      "text": "生命狀態評估：輕度脫水、睡眠不足，\n右側肋部挫傷尚未恢復。"
    },
    {
      "speaker": "Sbaak",
      "text": "我感覺得到。（身體的疼痛在提醒著我...）"
    },
    {
      "speaker": "飛船輔助系統",
      "text": "建議 - 請繼續休息。"
    },
    {
      "speaker": "Sbaak",
      "text": "船艙內的食物只剩兩包，水也撐不到明天。"
    },
    {
      "speaker": "Sbaak",
      "text": "再躺下去，情況也不會自己改善。"
    }
  ]
},
  "chapter03-section-1": {
  "characterDelaySeconds": 0.02,
  "speakers": [
    "Sbaak",
    "Echo",
    "飛船電腦",
    "飛船輔助系統"
  ],
  "lines": [
    {
      "speaker": "",
      "text": "未熄滅的營火仍燃燒著餘燼，飛船旁散落著凌亂的金屬板、線材與一堆掉落的貨箱。"
    },
    {
      "speaker": "Sbaak",
      "text": "只是能站起來而已…身體狀況比昨天還糟。"
    },
    {
      "speaker": "飛船輔助系統",
      "text": "偵測到站立平衡不穩定。\r\n再次建議停止活動並保持休息。"
    },
    {
      "speaker": "Sbaak",
      "text": "關閉健康提醒通知。(這個AI的積極度設定得太高了)"
    },
    {
      "speaker": "飛船輔助系統",
      "text": "健康提醒已降低至 - 必要警告。"
    },
    {
      "speaker": "Sbaak",
      "text": "很好，至少現在靜一點了，該來列整一下今天要處理的事項..."
    },
    {
      "speaker": "Sbaak",
      "text": "艙外的貨箱...好像還在，要檢查一下貨物...\r\n至少要取回一些緊急口糧跟淨水...有多少拿多少。"
    },
    {
      "speaker": "Sbaak",
      "text": "還要測試昨天架在外面的光波充電器，看能不能啟動電腦的安全模式..."
    },
    {
      "speaker": "Sbaak",
      "text": "總之先完成一些進度吧! 不然連活下去可能都是個問題..."
    }
  ]
},
  "chapter03-lower-left-not-ready": {
  "characterDelaySeconds": 0.02,
  "speakers": [
    "Sbaak"
  ],
  "lines": [
    {
      "speaker": "Sbaak",
      "text": "現在我還沒準備好。"
    }
  ]
},
  "chapter03_backpack-teaching": {
  "characterDelaySeconds": 0.02,
  "speakers": [
    "Sbaak",
    "Echo"
  ],
  "lines": [
    {
      "speaker": "Sbaak",
      "text": "好，收集到一點吃的了，有點累...打開背包喝點水吧。"
    },
    {
      "speaker": "",
      "text": "(我嘗試翻找背包裡收集到的口糧與飲水)"
    }
  ]
},
};

export const CHAPTER_3_START_DIALOGUE_ID = "chapter03-start";
export const CHAPTER_3_SECTION_1_DIALOGUE_ID = "chapter03-section-1";
export const CHAPTER_3_START_FLOW_ID = "chapter03-start-flow";
export const CHAPTER_3_START_DIALOGUE: InteractionDialogueScript =
  STORY_DIALOGUES[CHAPTER_3_START_DIALOGUE_ID] ?? {
    characterDelaySeconds: 0.02,
    speakers: ["Sbaak"],
    lines: [{ speaker: "Sbaak", text: "..." }],
  };

export const CHAPTER_3_START_FLOW: ChapterFlowDefinition = {
  id: CHAPTER_3_START_FLOW_ID,
  chapter: 3,
  once: true,
  actions: [
    { type: "lockInput" },
    { type: "setBlack", visible: true },
    { type: "wait", durationMs: 2000 },
    {
      type: "showCenteredText",
      lines: [
  "時間：墜落後第3天，清晨",
  "地點：飛船殘骸旁的臨時營地",
  "前提：身體與精神狀態尚未恢復，現有補給即將耗盡，",
  "必須開始尋找穩定的食物來源，同時加固營地並檢修電腦與通訊設備。"
],
      fadeInMs: 1500,
      holdMs: 8000,
      fadeOutMs: 1500,
    },
    { type: "wait", durationMs: 1500 },
    { type: "playDialogue", dialogueId: CHAPTER_3_START_DIALOGUE_ID },
    { type: "wait", durationMs: 2000 },
    { type: "fadeFromBlack", durationMs: 1000 },
    { type: "lockInput" },
    { type: "wait", durationMs: 1000 },
    { type: "playDialogue", dialogueId: CHAPTER_3_SECTION_1_DIALOGUE_ID },
    { type: "startQuest", questId: "QUEST_CH03_MAIN_001" },
    { type: "unlockInput" },
  ],
  skipActions: [
    { type: "setBlack", visible: true },
    { type: "fadeFromBlack", durationMs: 1000 },
    { type: "startQuest", questId: "QUEST_CH03_MAIN_001" },
    { type: "unlockInput" },
  ],
};
// CHAPTER_SCRIPT_EDITOR_GENERATED_END
