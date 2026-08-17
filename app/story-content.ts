import type { ChapterFlowDefinition } from "./chapter-flow-manager";
import type { InteractionDialogueScript } from "./interaction-flow";

/* CHAPTER_SCRIPT_EDITOR_DATA_BEGIN
ew0KICAic2NoZW1hVmVyc2lvbiI6IDIsDQogICJjaGFwdGVycyI6IFsNCiAgICB7DQogICAgICAiaWQiOiAicHJvbG9ndWUiLA0KICAgICAgInRhYk5hbWUiOiAi5bqP56ugIiwNCiAgICAgICJ0aXRsZSI6ICLkurrpoZ7nmoTluIzmnJsiLA0KICAgICAgImNoYXB0ZXJOdW1iZXIiOiAwLA0KICAgICAgInN1YnRpdGxlRXZlbnRzIjogW10sDQogICAgICAiZGlhbG9ndWVTZWN0aW9ucyI6IFtdLA0KICAgICAgInN0b3J5VHJpZ2dlckRpYWxvZ3VlcyI6IFtdDQogICAgfSwNCiAgICB7DQogICAgICAiaWQiOiAiY2hhcHRlcjAyIiwNCiAgICAgICJ0YWJOYW1lIjogIuesrOS6jOeroCIsDQogICAgICAidGl0bGUiOiAi56qB5aaC5YW25L6G55qE5oSP5aSWIiwNCiAgICAgICJjaGFwdGVyTnVtYmVyIjogMiwNCiAgICAgICJzdWJ0aXRsZUV2ZW50cyI6IFtdLA0KICAgICAgImRpYWxvZ3VlU2VjdGlvbnMiOiBbXSwNCiAgICAgICJzdG9yeVRyaWdnZXJEaWFsb2d1ZXMiOiBbXQ0KICAgIH0sDQogICAgew0KICAgICAgImlkIjogImNoYXB0ZXIwMyIsDQogICAgICAidGFiTmFtZSI6ICLnrKzkuInnq6AiLA0KICAgICAgInRpdGxlIjogIuWtmOa0u+eahOa6luWCmSIsDQogICAgICAiY2hhcHRlck51bWJlciI6IDMsDQogICAgICAic3VidGl0bGVFdmVudHMiOiBbDQogICAgICAgIHsNCiAgICAgICAgICAiaWQiOiAiY2hhcHRlcjAzLW9wZW5pbmctY2FyZCIsDQogICAgICAgICAgIm5hbWUiOiAi56ys5LiJ56ug6ZaL5aC05a2X5bmVIiwNCiAgICAgICAgICAidGV4dCI6ICLmmYLplpPvvJrlopzokL3lvoznrKwz5aSp77yM5riF5pmoXHJcbuWcsOm7nu+8mumjm+iIueaumOmquOaXgeeahOiHqOaZgueHn+WcsFxyXG7liY3mj5DvvJrouqvpq5ToiIfnsr7npZ7ni4DmhYvlsJrmnKrmgaLlvqnvvIznj77mnInoo5zntabljbPlsIfogJfnm6HvvIxcclxu5b+F6aCI6ZaL5aeL5bCL5om+56mp5a6a55qE6aOf54mp5L6G5rqQ77yM5ZCM5pmC5Yqg5Zu654ef5Zyw5Lim5qqi5L+u6Zu76IWm6IiH6YCa6KiK6Kit5YKZ44CCIiwNCiAgICAgICAgICAidHJpZ2dlclR5cGUiOiAiY2hhcHRlclN0YXJ0IiwNCiAgICAgICAgICAidHJpZ2dlclZhbHVlIjogIiIsDQogICAgICAgICAgInRyaWdnZXJDb3VudCI6IDEsDQogICAgICAgICAgImRlbGF5QmVmb3JlTXMiOiAyMDAwLA0KICAgICAgICAgICJmYWRlSW5NcyI6IDE1MDAsDQogICAgICAgICAgImhvbGRNcyI6IDgwMDAsDQogICAgICAgICAgImZhZGVPdXRNcyI6IDE1MDAsDQogICAgICAgICAgImRlbGF5QWZ0ZXJNcyI6IDE1MDAsDQogICAgICAgICAgImtlZXBCbGFjayI6IHRydWUsDQogICAgICAgICAgImxvY2tJbnB1dCI6IHRydWUNCiAgICAgICAgfQ0KICAgICAgXSwNCiAgICAgICJkaWFsb2d1ZVNlY3Rpb25zIjogWw0KICAgICAgICB7DQogICAgICAgICAgImlkIjogImNoYXB0ZXIwMy1zdGFydCIsDQogICAgICAgICAgIm5hbWUiOiAi56ys5LiJ56ugX1N0YXJ0IiwNCiAgICAgICAgICAiZGlhbG9ndWUiOiB7DQogICAgICAgICAgICAiY2hhcmFjdGVyRGVsYXlTZWNvbmRzIjogMC4wMiwNCiAgICAgICAgICAgICJzcGVha2VycyI6IFsNCiAgICAgICAgICAgICAgIlNiYWFrIiwNCiAgICAgICAgICAgICAgIj8/PyIsDQogICAgICAgICAgICAgICLpo5voiLnovJTliqnns7vntbEiLA0KICAgICAgICAgICAgICAiRWNobyINCiAgICAgICAgICAgIF0sDQogICAgICAgICAgICAibGluZXMiOiBbDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICIiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuiIueiJmeWFp+WCs+S+huS6huapn+aisOWVn+WLleeahOWWgOWZoOiBsu+8jOa3t+iRl+miqOmRvemAsuepuumameeahOiBsumfsy4uLiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIiIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi6YKE5pyJ5L2O5b6u55qE6Zu75rWB6Zuc6Z+z6IiH6YeR5bGs5p2/6ayG5YuV5LiN5pmC56Kw5pKe55qE6IGy6Z+/44CCIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiPz8/IiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICIuLi4uLi4iDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICLpo5voiLnovJTliqnns7vntbEiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuS6i+aVheW+jOaZgumWk+KApuKApuS6lOWNgeWFq+Wwj+aZgu+8jOS6jOWNgeS4gOWIhumQmOOAgiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIumjm+iIuei8lOWKqeezu+e1sSIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi55Sf5ZG954uA5oWL6KmV5Lyw77ya6LyV5bqm6ISr5rC044CB552h55yg5LiN6Laz77yMXG7lj7PlgbTogovpg6jmjKvlgrflsJrmnKrmgaLlvqnjgIIiDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICJTYmFhayIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi5oiR5oSf6Ka65b6X5Yiw44CC77yI6Lqr6auU55qE55a855eb5Zyo5o+Q6YaS6JGX5oiRLi4u77yJIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAi6aOb6Ii56LyU5Yqp57O757WxIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLlu7rorbAgLSDoq4vnubznuozkvJHmga/jgIIiDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICJTYmFhayIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi6Ii56ImZ5YWn55qE6aOf54mp5Y+q5Ymp5YWp5YyF77yM5rC05Lmf5pKQ5LiN5Yiw5piO5aSp44CCIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiU2JhYWsiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuWGjei6uuS4i+WOu++8jOaDheazgeS5n+S4jeacg+iHquW3seaUueWWhOOAgiINCiAgICAgICAgICAgICAgfQ0KICAgICAgICAgICAgXQ0KICAgICAgICAgIH0NCiAgICAgICAgfSwNCiAgICAgICAgew0KICAgICAgICAgICJpZCI6ICJjaGFwdGVyMDMtc2VjdGlvbi0xIiwNCiAgICAgICAgICAibmFtZSI6ICLnrKzkuInnq6BfU2VjdGlvbiAxIiwNCiAgICAgICAgICAiZGlhbG9ndWUiOiB7DQogICAgICAgICAgICAiY2hhcmFjdGVyRGVsYXlTZWNvbmRzIjogMC4wMiwNCiAgICAgICAgICAgICJzcGVha2VycyI6IFsNCiAgICAgICAgICAgICAgIlNiYWFrIiwNCiAgICAgICAgICAgICAgIkVjaG8iLA0KICAgICAgICAgICAgICAi6aOb6Ii56Zu76IWmIiwNCiAgICAgICAgICAgICAgIumjm+iIuei8lOWKqeezu+e1sSINCiAgICAgICAgICAgIF0sDQogICAgICAgICAgICAibGluZXMiOiBbDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICIiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuacqueGhOa7heeahOeHn+eBq+S7jeeHg+eHkuiRl+mkmOeHvO+8jOmjm+iIueaXgeaVo+iQveiRl+WHjOS6gueahOmHkeWxrOadv+OAgee3muadkOiIh+S4gOWghuaOieiQveeahOiyqOeuseOAgiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLlj6rmmK/og73nq5notbfkvobogIzlt7LigKbouqvpq5Tni4Dms4Hmr5TmmKjlpKnpgoTns5/jgIIiDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICLpo5voiLnovJTliqnns7vntbEiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuWBtea4rOWIsOermeeri+W5s+ihoeS4jeepqeWumuOAglxyXG7lho3mrKHlu7rorbDlgZzmraLmtLvli5XkuKbkv53mjIHkvJHmga/jgIIiDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICJTYmFhayIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi6Zec6ZaJ5YGl5bq35o+Q6YaS6YCa55+l44CCKOmAmeWAi0FJ55qE56mN5qW15bqm6Kit5a6a5b6X5aSq6auY5LqGKSINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIumjm+iIuei8lOWKqeezu+e1sSIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi5YGl5bq35o+Q6YaS5bey6ZmN5L2O6IezIC0g5b+F6KaB6K2m5ZGK44CCIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiU2JhYWsiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuW+iOWlve+8jOiHs+WwkeePvuWcqOmdnOS4gOm7nuS6hu+8jOipsuS+huWIl+aVtOS4gOS4i+S7iuWkqeimgeiZleeQhueahOS6i+mghS4uLiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLoiZnlpJbnmoTosqjnrrEuLi7lpb3lg4/pgoTlnKjvvIzopoHmqqLmn6XkuIDkuIvosqjniakuLi5cclxu6Iez5bCR6KaB5Y+W5Zue5LiA5Lqb57eK5oCl5Y+j57On6Lef5reo5rC0Li4u5pyJ5aSa5bCR5ou/5aSa5bCR44CCIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiU2JhYWsiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIumChOimgea4rOippuaYqOWkqeaetuWcqOWklumdoueahOWFieazouWFhembu+WZqO+8jOeci+iDveS4jeiDveWVn+WLlembu+iFpueahOWuieWFqOaooeW8jy4uLiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLnuL3kuYvlhYjlrozmiJDkuIDkupvpgLLluqblkKchIOS4jeeEtumAo+a0u+S4i+WOu+WPr+iDvemDveaYr+WAi+WVj+mhjC4uLiINCiAgICAgICAgICAgICAgfQ0KICAgICAgICAgICAgXQ0KICAgICAgICAgIH0NCiAgICAgICAgfSwNCiAgICAgICAgew0KICAgICAgICAgICJpZCI6ICJjaGFwdGVyMDMtc2VjdGlvbi0yIiwNCiAgICAgICAgICAibmFtZSI6ICLnrKzkuInnq6BfU2VjdGlvbiAyIiwNCiAgICAgICAgICAiZGlhbG9ndWUiOiB7DQogICAgICAgICAgICAiY2hhcmFjdGVyRGVsYXlTZWNvbmRzIjogMC4wMiwNCiAgICAgICAgICAgICJzcGVha2VycyI6IFsNCiAgICAgICAgICAgICAgIlNiYWFrIiwNCiAgICAgICAgICAgICAgIkVjaG8iDQogICAgICAgICAgICBdLA0KICAgICAgICAgICAgImxpbmVzIjogWw0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICIo6aOy55So5a6M5LiA55O25reo5rC05b6M77yM5oiR5b235b2/542y5b6X5LqG5pWR6LSWKSINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLpm5bnhLbnj77lnKjlpKnoibLpgoTml6nvvIzkvYbpgoTmmK/lpJrkvJHmga/orpPouqvpq5TppIrlgrfmr5TovIPlpb0uLi5cclxu5pu05L2V5rOB6YCZ6aGG5pif55CD55qE55m95aSp5qC55pys5LiN5puJ5b6X5pyJ5aSa6ZW35ZWKISINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLlhYjlm57kvIrolqnljaHomZ/vvIzmiJHmh4noqbLopoHlpb3lpb3opo/lioPkuIDkuIvoqbLmgI7purzmiY3og73ohKvpm6LpgJnpoYbmmJ/nkIMuLi4iDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICJTYmFhayIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi562J5b6F5pWR5o+0PyDkvYbkuZ/opoHmnInovqbms5XnmbzpgIHmsYLmlZHoqIromZ8uLi4gKOaAneiAgylcclxu5bCN5LqGLi4uISDlsIfmsoPniL7nibnpgJroqIrpmaPliJfntYToo53otbfkvoY/Ig0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiU2JhYWsiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuaHieipsuigu+acieapn+acg+eahO+8jOaIkeiomOW+l+WJm+aJjeWcqOWCmeWTgea4heWWruS4iueci+WIsO+8jFxyXG7osqjoiZnpgoTmnInlgpnnlKjpm7bku7bvvIzlj6ropoHlho0uLi4gKOWkp+iFpumjm+mAn+eahOaAnee0oikiDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICJTYmFhayIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi57i95LmL5YWI6L+U5Zue5LyK6Jap5Y2h6Jmf77yM5oiR5oOz5LiA5a6a5pyD5pyJ6L6m5rOV55qE44CCIg0KICAgICAgICAgICAgICB9DQogICAgICAgICAgICBdDQogICAgICAgICAgfQ0KICAgICAgICB9LA0KICAgICAgICB7DQogICAgICAgICAgImlkIjogImNoYXB0ZXIwMy1zZWN0aW9uLTMiLA0KICAgICAgICAgICJuYW1lIjogIuesrOS4ieeroF9TZWN0aW9uIDMiLA0KICAgICAgICAgICJkaWFsb2d1ZSI6IHsNCiAgICAgICAgICAgICJjaGFyYWN0ZXJEZWxheVNlY29uZHMiOiAwLjAyLA0KICAgICAgICAgICAgInNwZWFrZXJzIjogWw0KICAgICAgICAgICAgICAiU2JhYWsiLA0KICAgICAgICAgICAgICAiRWNobyIsDQogICAgICAgICAgICAgICLpo5voiKrns7vntbFBSSINCiAgICAgICAgICAgIF0sDQogICAgICAgICAgICAibGluZXMiOiBbDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICJTYmFhayIsDQogICAgICAgICAgICAgICAgInRleHQiOiAiLi4uIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiU2JhYWsiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuKApuaYqOaZmuedoeW+l+avlOaDs+WDj+S4reWuieepqeOAgiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLlpoLmnpzpgJroqIroqK3lgpnnnJ/nmoTpgoTog73kv67lvqnigKZcclxu5Lmf6Kix5LiN5Y+q5piv5rS75LiL5Y67Li4uIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiU2JhYWsiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIumChOacieWbnuWutueahOWPr+iDveOAgiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLkuI3pgY7nnaHkuobkuIDmmZrvvIzogprlrZDlpb3ppJPllYouLi5cclxu6KaB5pyJ6auU5Yqb5bel5L2c55qE6Kmx77yM6Iez5bCR6KaB5ZCD6aCT6aO96aOv44CCIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiU2JhYWsiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuiDjOWMheijoemChOaciee3iuaApeWPo+ezp++8jOS9hueCuuS6humVt+mBoOaJk+eul++8jOacgOWlveS4jeimgeWPquS+neiztOWPo+ezp++8jFxyXG7mh4noqbLopoHog73lvp7pgJnlgIvmmJ/nkIPnjbLlj5bmlrDprq7nmoTpo5/nianjgIIiDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICIiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIijngrrkuobnlJ/lrZjpnIDopoHlpqXlloTnrqHnkIbmiJHnmoTouqvpq5TlsazmgKcgKSINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLlmL9+IOmjm+iIqumbu+iFpu+8jOS9oOWcqOWXjj9cclxu5YaN6Kqq5piO5LiA5LiL5oiR5oeJ6Kmy5o6n566h5oiR6Lqr6auU55qE5ZOq5Lqb5qmf6IO9PyINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIumjm+iIquezu+e1sUFJIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLmoLnmk5rkvIrolqnljaHomZ/oiLnlk6Hpo5vooYzmiYvlhoogLSDnrKzlhavnq6Ag56ys5LqM5bCP56+A77yMXHJcbueVtuiIueWToeWcqOacquefpeeSsOWig+mdouiHqOeUn+WtmOiIh+WBpeW6t+miqOmaquaDheazgeaZgu+8jOaHieWmpeWWhOmBteW+queahOazqOaEj+S6i+mghSA6Ig0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAi6aOb6Iiq57O757WxQUkiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIueuoeeQhumrlOWKmyA6IOS8keaBr+iIh+edoeecoOWPr+S7pemBqeW6puaBouW+qemrlOWKm++8jOS9huacg+a2iOiAl+avlOi8g+WkmuaZgumWk+OAglxyXG7pg6jliIblt6XkvZzoiIfnkrDlooPkvZzmpa3vvIzmnIPopoHmsYLoiLnlk6Hmk4HmnInkuIDlrprnqIvluqbnmoTpq5TlipvmiY3mnIPmjojmrIrllZ/li5XjgIIiDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICLpo5voiKrns7vntbFBSSIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi566h55CG6aOy6aOfIDog6ZW35pmC6ZaT6aOi6aST5pyD5b2x6Z+/6KGM5YuV6YCf5bqm77yM5L2O5pa85p+Q5YCL56iL5bqm5pyD5b2x6Z+/6Lqr6auU5qmf6IO95bCN5pON5L2c5Zmo5YW355qE5a6J5YWo5oCn44CCXHJcbuW7uuitsCAtIOS/neaMgeWFhei2s+eahOmjsumjn+S4puacgOWkp+eoi+W6puaUtumbhuS4gOWIh+eSsOWig+WPr+aPkOS+m+S5i+WPr+mjn+eUqOizh+a6kOOAgiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIumjm+iIquezu+e1sUFJIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLnrqHnkIbpo7LmsLQgOiDnvLrmsLTkuZ/mnIPlvbHpn7/np7vli5XpgJ/luqbvvIzplbfmnJ/nvLrmsLTnlJroh7PmnIPlsI7oh7TnlJ/lkb3ljbHpmqrjgIJcclxu5rOo5oSPIC0g5Zyo5pyq55+l55Kw5aKD5Lit5pyA5YWI6ZyA6KaB56K65L+d55qE5bCx5piv56mp5a6a55qE6aOy55So5rC06LOH5rqQ77yM5Lim5LiU6KaB5rOo5oSP6aOy55So5rC055qE5a6J5YWo5oCn44CCIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAi6aOb6Iiq57O757WxQUkiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIueuoeeQhueyvuelniA6IOeyvuelnuaYr+acgOmHjeimgeeahOeLgOaFi++8jOimgeiIh+ioreWCmeS6kuWLleOAgeizh+aWmeeahOmWseiugOOAgemAmuioiuino+eivC4uLlxyXG7pg73ku7Dos7Tkv53mjIHkuIDlrprnmoTnsr7npZ7lipvvvIznlbbnlJ/nkIbpnIDmsYLpoLvnuYHpgY7kvY7vvIzmnIPlsI7oh7Tnsr7npZ7kuI3mv5/nlJroh7PltKnmvbDjgIJcclxu6KuL5LiA5a6a6KaB5L+d5oyB5aCF5by355qE5rGC55Sf5oSP5b+X77yM5Lim5LiU5oyB57qM5L+d5oyB6JGX5biM5pyb44CCIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiU2JhYWsiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIi4uLijogb3lrozpgJnkupvms6jmhI/kuovpoIUpXHJcbuaIkeacieeorumbo+S7peiogOWWu+eahOaDhee3ki4uLiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLkvYbkuI3nrqHmgI7purzoqqrvvIzpgoTmmK/lhYjmib7lh7rpgJroqIrpmaPliJfnmoTpm7bku7bvvIzlho3kvobmgJ3ogIPlsI3nrZblkKchIg0KICAgICAgICAgICAgICB9DQogICAgICAgICAgICBdDQogICAgICAgICAgfQ0KICAgICAgICB9LA0KICAgICAgICB7DQogICAgICAgICAgImlkIjogImNoYXB0ZXIwMy1zZWN0aW9uLTQiLA0KICAgICAgICAgICJuYW1lIjogIuesrOS4ieeroF9TZWN0aW9uIDQiLA0KICAgICAgICAgICJkaWFsb2d1ZSI6IHsNCiAgICAgICAgICAgICJjaGFyYWN0ZXJEZWxheVNlY29uZHMiOiAwLjAyLA0KICAgICAgICAgICAgInNwZWFrZXJzIjogWw0KICAgICAgICAgICAgICAiU2JhYWsiLA0KICAgICAgICAgICAgICAiRWNobyINCiAgICAgICAgICAgIF0sDQogICAgICAgICAgICAibGluZXMiOiBbDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICJTYmFhayIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi5pS26ZuG5a6M6YCa6KiK6Zmj5YiX55qE6Zu25Lu25LqG77yM5bel5YW357WE5Lmf5rqW5YKZ5aW95LqGLi4uIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiU2JhYWsiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuaOpeS4i+S+huWPquimgee1hOijnei1t+S+hu+8jOWwseWPr+S7peaOg+aPj+WcsOeQg+auluawkeWcsOeahOaWueS9jeioiuiZn+S6huOAgiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLlhYjoqr/lh7rpgJroqIrpmaPliJfnmoTntq3kv67ol43lnJbvvIzmiorlroPlrZjliLDlt6XnqIvlubPmnb8uLi5cclxuKOaIkeWJjeW+gOiHqOaZgumbu+iFpua6luWCmeWtmOWPluebuOmXnOizh+aWmSkiDQogICAgICAgICAgICAgIH0NCiAgICAgICAgICAgIF0NCiAgICAgICAgICB9DQogICAgICAgIH0sDQogICAgICAgIHsNCiAgICAgICAgICAiaWQiOiAiY2hhcHRlcjAzLXNlY3Rpb24tNSIsDQogICAgICAgICAgIm5hbWUiOiAi56ys5LiJ56ugX1NlY3Rpb24gNSIsDQogICAgICAgICAgImRpYWxvZ3VlIjogew0KICAgICAgICAgICAgImNoYXJhY3RlckRlbGF5U2Vjb25kcyI6IDAuMDIsDQogICAgICAgICAgICAic3BlYWtlcnMiOiBbDQogICAgICAgICAgICAgICJTYmFhayIsDQogICAgICAgICAgICAgICJFY2hvIiwNCiAgICAgICAgICAgICAgIumjm+iIueW3peeoi+mbu+iFpkFJIg0KICAgICAgICAgICAgXSwNCiAgICAgICAgICAgICJsaW5lcyI6IFsNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLmiJHmqqLmn6XkuIDkuIsuLi7lhbHmjK/nmbzpm7vmlYjnjocuLi5cclxu54++5Zyo5Y+q5pyJNiUuLi4iDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICJTYmFhayIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi6YKj5LiN5bCx5piv5b+r5rKS6Zu75LqG5ZeOPyAo5oiR5oSf5Yiw6I6r5ZCN5YW25aaZKSINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIumjm+iIueW3peeoi+mbu+iFpkFJIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLlhbHmjK/pm7vmmbbpq5Tpm7bku7bmkI3mr4DvvIzoq4vmm7Tmj5vpm7vmmbbpq5TjgIIiDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICJTYmFhayIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi5YWx5oyv6Zu75pm26auUIT8g6YCZ6bq85Z+65pys55qE6Zu25Lu25Lmf5pyD5pyJ5ZWP6aGMP1xyXG7oiLnkuIrmnIPmnInlgpnmlpnll44/Ig0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiU2JhYWsiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIijliqrlipvlm57mg7PosqjpgYvmuIXllq4pIOS9huaIkeWlveWDj+S4jeiomOW+l+aciea6luWCmeebuOmXnOeahOWCmeWTgS4uLiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLlmL9+IOmjm+iIqumbu+iFpu+8jOS8iuiWqeWNoeiZn+S4iuacieWFseaMr+mbu+aZtumrlOeahOWCmeWTgeWXjj8iDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICLpo5voiLnlt6XnqIvpm7vohaZBSSIsDQogICAgICAgICAgICAgICAgInRleHQiOiAiLi4u5pCc5bCL5bqr5oi/6bue5Lqk5riF5ZauXHJcbi4uLuaQnOWwi+iyqOeJqemBi+i8uOa4heWWriINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIumjm+iIueW3peeoi+mbu+iFpkFJIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLntpPpgY7mn6XoqaLvvIzljp/mnKznmoTmqZ/pm7vlrqTlt6XnqIvosqjoiZnlnKhGTFAg4oCUIEZvcmNlZCBMYW5kaW5nIFByb3RvY29sXG7ov6vpmY3nqIvluo/mmYLlt7LntpPkvp3mtYHnqIvnt4rmgKXohKvpm6LjgIIiDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICLpo5voiLnlt6XnqIvpm7vohaZBSSIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi54++5Zyo5LyK6Jap5Y2h6Jmf5LiK5rKS5pyJ5YWx5oyv6Zu75pm26auU55qE5YKZ5ZOB5YWD5Lu244CCXHJcbuW7uuitsOWwi+aJvuabv+S7o+WFg+S7tuOAgiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICIo5oiR55yJ6aCt5LiA6Y6WLi4uKSDpgJnkuIvpurvnhankuobjgIIiDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICJTYmFhayIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi6aOb6Iiq6Zu76IWm77yM5pyJ6L6m5rOV5p+l5Ye66LKo6ImZ55qE6ISr6Zui5bqn5qiZ5ZeOPyINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIumjm+iIueW3peeoi+mbu+iFpkFJIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLmiJHmnIPoqr/lh7rlt6XnqIvosqjoiZnnt4rmgKXohKvpm6LnqIvluo/mmYLnmoTmrbfnqIvoqJjpjITjgIIiDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICLpo5voiLnlt6XnqIvpm7vohaZBSSIsDQogICAgICAgICAgICAgICAgInRleHQiOiAiWzA0OjE2OjQyXSBDQVJHTyBNT0RVTEUgQy0wMiAuLi4uLi4gRU1FUkdFTkNZIFNFUEFSQVRJT04gQ09ORklSTUVEXG5bMDQ6MTc6MDhdIE1BSU4gUFJPUFVMU0lPTiAuLi4uLi4uLiBUSFJVU1QgTE9TUyAvIEFVVE8tUkVTVEFSVCBGQUlMRURcblswNDoxNzozMV0gRkxJR0hUIENPTlRST0wgLi4uLi4uLi4uIEZPUkNFRCBMQU5ESU5HIFBST1RPQ09MIElOSVRJQVRFRFxuWzA0OjE4OjA3XSBJTVBBQ1QgREVURUNURUQgLi4uLi4uLi4gQUxMIEZMSUdIVCBTWVNURU1TIE9GRkxJTkUiDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICLpo5voiLnlt6XnqIvpm7vohaZBSSIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi5bel56iL6LKo6ImZ5ZyoIFswNDoxNjo0Ml0g5pmC5ZWf5YuV6ISr6Zui77yMXHJcbuaIkeeEoeazleWumuS9jemAmemhhuaYn+eQg+eahOW6p+aomeezu+e1se+8jOaJgOS7peaykuacieW6p+aomeWcsOm7nuizh+ioiuOAgiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIumjm+iIueW3peeoi+mbu+iFpkFJIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLkvYbmmK/moLnmk5rkvIrolqnljaHomZ/nmoTkuovku7bntIDpjITlhIDpoa/npLrvvIxcclxu6LKo6ImZ6ISr6Zui5pmC6ZaT77yaWzA0OjE2OjQyXeOAguiIuemrlOaSnuaTiuaZgumWk++8mlswNDoxODowN13jgIJcclxu5YWp6ICF55u46ZqUIDg1IOenkuOAgiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIumjm+iIueW3peeoi+mbu+iFpkFJIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLohKvpm6LmmYLoiKrpgJ/ntITmr4/np5IgMjE0IOWFrOWwuu+8m+aSnuaTiuWJjeW3suS4i+mZjeiHs+avj+enkiA5NiDlhazlsLrjgIJcclxu5q2j5Zyo5q+U5bCN5pyf6ZaT6Iiq5ZCR6IiH5rib6YCf5puy57ea4oCm4oCmIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAi6aOb6Ii55bel56iL6Zu76IWmQUkiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuS+neeFp+iEq+mbouaZgumWk+OAgemjm+ihjOmAn+W6puiIh+acgOW+jOiIqui3oeWPjeWQkeaOqOeul++8jFxyXG7osqjoiZnmh4nmlrzkuLvoiLnlopzmr4Dpu57liY3mlrnntIQgOC42IOWFrOmHjOevhOWcjeWFp+iQveWcsOOAgiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIiIsDQogICAgICAgICAgICAgICAgInRleHQiOiAiKOWcsOWcluS4iuaomeekuuWHuuS4gOeJh+mgkOa4rOaQnOWwi+WNgOWfn+OAgikiDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICLpo5voiLnlt6XnqIvpm7vohaZBSSIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi5bey5qiZ6KiY6aCQ5ris5aKc6JC95Y2A44CC5Y+X5rCj5rWB6IiH6LKo6ImZ57+75ru+5b2x6Z+/77yMXHJcbuWvpumam+S9jee9ruWPr+iDveWtmOWcqOe0hOWbm+eZvuWFrOWwuuiqpOW3ruOAgiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICI4Ljblhazph4wuLi7pgoTnnJ/pgaDllYouLi4gKOaIkeaAneiAg+iRl+ipsuaAjum6vOaQnOWwi+eahOaWueazlSkiDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICJTYmFhayIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi5L2G5piv5pO05aSn5LiA6bue5pCc5bCL56+E5ZyN5Lmf5piv5b+F6KaB55qE77yM6LaB5aSp6buR5YmN56iN5b6u5b6A6KW/6YKK5YuY5p+l5LiA5LiL5aW95LqG44CCIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiU2JhYWsiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuiomOW+l+W4tuS4gOm7nuWPo+ezp+i3n+mjsuawtO+8jOS7peWFjeWbnueoi+iAveaTseS6huOAgiINCiAgICAgICAgICAgICAgfQ0KICAgICAgICAgICAgXQ0KICAgICAgICAgIH0NCiAgICAgICAgfQ0KICAgICAgXSwNCiAgICAgICJzdG9yeVRyaWdnZXJEaWFsb2d1ZXMiOiBbDQogICAgICAgIHsNCiAgICAgICAgICAiaWQiOiAiY2hhcHRlcjAzLWxvd2VyLWxlZnQtbm90LXJlYWR5IiwNCiAgICAgICAgICAibmFtZSI6ICLnrKzkuInnq6Bf5bem5LiL5YqH5oOF5Y2AX+Wwmuacqua6luWCmeWlvSIsDQogICAgICAgICAgImRpYWxvZ3VlIjogew0KICAgICAgICAgICAgImNoYXJhY3RlckRlbGF5U2Vjb25kcyI6IDAuMDIsDQogICAgICAgICAgICAic3BlYWtlcnMiOiBbDQogICAgICAgICAgICAgICJTYmFhayINCiAgICAgICAgICAgIF0sDQogICAgICAgICAgICAibGluZXMiOiBbDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICJTYmFhayIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi54++5Zyo5oiR6YKE5rKS5rqW5YKZ5aW944CCIg0KICAgICAgICAgICAgICB9DQogICAgICAgICAgICBdDQogICAgICAgICAgfQ0KICAgICAgICB9LA0KICAgICAgICB7DQogICAgICAgICAgImlkIjogImNoYXB0ZXIwM19iYWNrcGFjay10ZWFjaGluZyIsDQogICAgICAgICAgIm5hbWUiOiAi6IOM5YyF6IiH5L2/55So5pWZ5a24IiwNCiAgICAgICAgICAiZGlhbG9ndWUiOiB7DQogICAgICAgICAgICAiY2hhcmFjdGVyRGVsYXlTZWNvbmRzIjogMC4wMiwNCiAgICAgICAgICAgICJzcGVha2VycyI6IFsNCiAgICAgICAgICAgICAgIlNiYWFrIiwNCiAgICAgICAgICAgICAgIkVjaG8iDQogICAgICAgICAgICBdLA0KICAgICAgICAgICAgImxpbmVzIjogWw0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiU2JhYWsiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuWlve+8jOaUtumbhuWIsOS4gOm7nuWQg+eahOS6hu+8jOaciem7nue0ry4uLuaJk+mWi+iDjOWMheWWnem7nuawtOWQp+OAgiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIiIsDQogICAgICAgICAgICAgICAgInRleHQiOiAiKOaIkeWYl+ippue/u+aJvuiDjOWMheijoeaUtumbhuWIsOeahOWPo+ezp+iIh+mjsuawtCkiDQogICAgICAgICAgICAgIH0NCiAgICAgICAgICAgIF0NCiAgICAgICAgICB9DQogICAgICAgIH0sDQogICAgICAgIHsNCiAgICAgICAgICAiaWQiOiAiY2hhcHRlcjAzLXNjZW5lMi1zdGFydCIsDQogICAgICAgICAgIm5hbWUiOiAi56ys5LiJ56ugX1NjZW5lMl9TdGFydCIsDQogICAgICAgICAgImRpYWxvZ3VlIjogew0KICAgICAgICAgICAgImNoYXJhY3RlckRlbGF5U2Vjb25kcyI6IDAuMDIsDQogICAgICAgICAgICAic3BlYWtlcnMiOiBbDQogICAgICAgICAgICAgICJTYmFhayIsDQogICAgICAgICAgICAgICJFY2hvIg0KICAgICAgICAgICAgXSwNCiAgICAgICAgICAgICJsaW5lcyI6IFsNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLpgJnoo6HmnpznhLbkuZ/mnInmjonokL3nmoTosqjnianvvIzmiJHnorroqo3nnIvnnIvmnInku4Dpurzlj6/ku6Xlj5blm57nmoTjgIIiDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICJTYmFhayIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi5ZKmPyDpgqPlgIvlsqnlo4HnmoTkuIvlsaTmnInkuIDlgIvlvojlg4/lhazlj7jnmoTosqjniakuLi7lho3pnaDpgY7ljrvoqr/mn6XnnIvnnIvjgIIiDQogICAgICAgICAgICAgIH0NCiAgICAgICAgICAgIF0NCiAgICAgICAgICB9DQogICAgICAgIH0NCiAgICAgIF0NCiAgICB9DQogIF0NCn0=
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
      },
      {
        "id": "chapter03-section-2",
        "name": "第三章_Section 2",
        "dialogue": {
          "characterDelaySeconds": 0.02,
          "speakers": [
            "Sbaak",
            "Echo"
          ],
          "lines": [
            {
              "speaker": "",
              "text": "(飲用完一瓶淨水後，我彷彿獲得了救贖)"
            },
            {
              "speaker": "Sbaak",
              "text": "雖然現在天色還早，但還是多休息讓身體養傷比較好...\r\n更何況這顆星球的白天根本不曉得有多長啊!"
            },
            {
              "speaker": "Sbaak",
              "text": "先回伊薩卡號，我應該要好好規劃一下該怎麼才能脫離這顆星球..."
            },
            {
              "speaker": "Sbaak",
              "text": "等待救援? 但也要有辦法發送求救訊號... (思考)\r\n對了...! 將沃爾特通訊陣列組裝起來?"
            },
            {
              "speaker": "Sbaak",
              "text": "應該蠻有機會的，我記得剛才在備品清單上看到，\r\n貨艙還有備用零件，只要再... (大腦飛速的思索)"
            },
            {
              "speaker": "Sbaak",
              "text": "總之先返回伊薩卡號，我想一定會有辦法的。"
            }
          ]
        }
      },
      {
        "id": "chapter03-section-3",
        "name": "第三章_Section 3",
        "dialogue": {
          "characterDelaySeconds": 0.02,
          "speakers": [
            "Sbaak",
            "Echo",
            "飛航系統AI"
          ],
          "lines": [
            {
              "speaker": "Sbaak",
              "text": "..."
            },
            {
              "speaker": "Sbaak",
              "text": "…昨晚睡得比想像中安穩。"
            },
            {
              "speaker": "Sbaak",
              "text": "如果通訊設備真的還能修復…\r\n也許不只是活下去..."
            },
            {
              "speaker": "Sbaak",
              "text": "還有回家的可能。"
            },
            {
              "speaker": "Sbaak",
              "text": "不過睡了一晚，肚子好餓啊...\r\n要有體力工作的話，至少要吃頓飽飯。"
            },
            {
              "speaker": "Sbaak",
              "text": "背包裡還有緊急口糧，但為了長遠打算，最好不要只依賴口糧，\r\n應該要能從這個星球獲取新鮮的食物。"
            },
            {
              "speaker": "",
              "text": "(為了生存需要妥善管理我的身體屬性 )"
            },
            {
              "speaker": "Sbaak",
              "text": "嘿~ 飛航電腦，你在嗎?\r\n再說明一下我應該控管我身體的哪些機能?"
            },
            {
              "speaker": "飛航系統AI",
              "text": "根據伊薩卡號船員飛行手冊 - 第八章 第二小節，\r\n當船員在未知環境面臨生存與健康風險情況時，應妥善遵循的注意事項 :"
            },
            {
              "speaker": "飛航系統AI",
              "text": "管理體力 : 休息與睡眠可以適度恢復體力，但會消耗比較多時間。\r\n部分工作與環境作業，會要求船員擁有一定程度的體力才會授權啟動。"
            },
            {
              "speaker": "飛航系統AI",
              "text": "管理飲食 : 長時間飢餓會影響行動速度，低於某個程度會影響身體機能對操作器具的安全性。\r\n建議 - 保持充足的飲食並最大程度收集一切環境可提供之可食用資源。"
            },
            {
              "speaker": "飛航系統AI",
              "text": "管理飲水 : 缺水也會影響移動速度，長期缺水甚至會導致生命危險。\r\n注意 - 在未知環境中最先需要確保的就是穩定的飲用水資源，並且要注意飲用水的安全性。"
            },
            {
              "speaker": "飛航系統AI",
              "text": "管理精神 : 精神是最重要的狀態，要與設備互動、資料的閱讀、通訊解碼...\r\n都仰賴保持一定的精神力，當生理需求頻繁過低，會導致精神不濟甚至崩潰。\r\n請一定要保持堅強的求生意志，並且持續保持著希望。"
            },
            {
              "speaker": "Sbaak",
              "text": "...(聽完這些注意事項)\r\n我有種難以言喻的情緒..."
            },
            {
              "speaker": "Sbaak",
              "text": "但不管怎麼說，還是先找出通訊陣列的零件，再來思考對策吧!"
            }
          ]
        }
      },
      {
        "id": "chapter03-section-4",
        "name": "第三章_Section 4",
        "dialogue": {
          "characterDelaySeconds": 0.02,
          "speakers": [
            "Sbaak",
            "Echo"
          ],
          "lines": [
            {
              "speaker": "Sbaak",
              "text": "收集完通訊陣列的零件了，工具組也準備好了..."
            },
            {
              "speaker": "Sbaak",
              "text": "接下來只要組裝起來，就可以掃描地球殖民地的方位訊號了。"
            },
            {
              "speaker": "Sbaak",
              "text": "先調出通訊陣列的維修藍圖，把它存到工程平板...\r\n(我前往臨時電腦準備存取相關資料)"
            }
          ]
        }
      },
      {
        "id": "chapter03-section-5",
        "name": "第三章_Section 5",
        "dialogue": {
          "characterDelaySeconds": 0.02,
          "speakers": [
            "Sbaak",
            "Echo",
            "飛船工程電腦AI"
          ],
          "lines": [
            {
              "speaker": "Sbaak",
              "text": "我檢查一下...共振發電效率...\r\n現在只有6%..."
            },
            {
              "speaker": "Sbaak",
              "text": "那不就是快沒電了嗎? (我感到莫名其妙)"
            },
            {
              "speaker": "飛船工程電腦AI",
              "text": "共振電晶體零件損毀，請更換電晶體。"
            },
            {
              "speaker": "Sbaak",
              "text": "共振電晶體!? 這麼基本的零件也會有問題?\r\n船上會有備料嗎?"
            },
            {
              "speaker": "Sbaak",
              "text": "(努力回想貨運清單) 但我好像不記得有準備相關的備品..."
            },
            {
              "speaker": "Sbaak",
              "text": "嘿~ 飛航電腦，伊薩卡號上有共振電晶體的備品嗎?"
            },
            {
              "speaker": "飛船工程電腦AI",
              "text": "...搜尋庫房點交清單\r\n...搜尋貨物運輸清單"
            },
            {
              "speaker": "飛船工程電腦AI",
              "text": "經過查詢，原本的機電室工程貨艙在FLP — Forced Landing Protocol\n迫降程序時已經依流程緊急脫離。"
            },
            {
              "speaker": "飛船工程電腦AI",
              "text": "現在伊薩卡號上沒有共振電晶體的備品元件。\r\n建議尋找替代元件。"
            },
            {
              "speaker": "Sbaak",
              "text": "(我眉頭一鎖...) 這下麻煩了。"
            },
            {
              "speaker": "Sbaak",
              "text": "飛航電腦，有辦法查出貨艙的脫離座標嗎?"
            },
            {
              "speaker": "飛船工程電腦AI",
              "text": "我會調出工程貨艙緊急脫離程序時的歷程記錄。"
            },
            {
              "speaker": "飛船工程電腦AI",
              "text": "[04:16:42] CARGO MODULE C-02 ...... EMERGENCY SEPARATION CONFIRMED\n[04:17:08] MAIN PROPULSION ........ THRUST LOSS / AUTO-RESTART FAILED\n[04:17:31] FLIGHT CONTROL ......... FORCED LANDING PROTOCOL INITIATED\n[04:18:07] IMPACT DETECTED ........ ALL FLIGHT SYSTEMS OFFLINE"
            },
            {
              "speaker": "飛船工程電腦AI",
              "text": "工程貨艙在 [04:16:42] 時啟動脫離，\r\n我無法定位這顆星球的座標系統，所以沒有座標地點資訊。"
            },
            {
              "speaker": "飛船工程電腦AI",
              "text": "但是根據伊薩卡號的事件紀錄儀顯示，\r\n貨艙脫離時間：[04:16:42]。船體撞擊時間：[04:18:07]。\r\n兩者相隔 85 秒。"
            },
            {
              "speaker": "飛船工程電腦AI",
              "text": "脫離時航速約每秒 214 公尺；撞擊前已下降至每秒 96 公尺。\r\n正在比對期間航向與減速曲線……"
            },
            {
              "speaker": "飛船工程電腦AI",
              "text": "依照脫離時間、飛行速度與最後航跡反向推算，\r\n貨艙應於主船墜毀點前方約 8.6 公里範圍內落地。"
            },
            {
              "speaker": "",
              "text": "(地圖上標示出一片預測搜尋區域。)"
            },
            {
              "speaker": "飛船工程電腦AI",
              "text": "已標記預測墜落區。受氣流與貨艙翻滾影響，\r\n實際位置可能存在約四百公尺誤差。"
            },
            {
              "speaker": "Sbaak",
              "text": "8.6公里...還真遠啊... (我思考著該怎麼搜尋的方法)"
            },
            {
              "speaker": "Sbaak",
              "text": "但是擴大一點搜尋範圍也是必要的，趁天黑前稍微往西邊勘查一下好了。"
            },
            {
              "speaker": "Sbaak",
              "text": "記得帶一點口糧跟飲水，以免回程耽擱了。"
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
      },
      {
        "id": "chapter03-scene2-start",
        "name": "第三章_Scene2_Start",
        "dialogue": {
          "characterDelaySeconds": 0.02,
          "speakers": [
            "Sbaak",
            "Echo"
          ],
          "lines": [
            {
              "speaker": "Sbaak",
              "text": "這裡果然也有掉落的貨物，我確認看看有什麼可以取回的。"
            },
            {
              "speaker": "Sbaak",
              "text": "咦? 那個岩壁的下層有一個很像公司的貨物...再靠過去調查看看。"
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
  "chapter03-section-2": {
  "characterDelaySeconds": 0.02,
  "speakers": [
    "Sbaak",
    "Echo"
  ],
  "lines": [
    {
      "speaker": "",
      "text": "(飲用完一瓶淨水後，我彷彿獲得了救贖)"
    },
    {
      "speaker": "Sbaak",
      "text": "雖然現在天色還早，但還是多休息讓身體養傷比較好...\r\n更何況這顆星球的白天根本不曉得有多長啊!"
    },
    {
      "speaker": "Sbaak",
      "text": "先回伊薩卡號，我應該要好好規劃一下該怎麼才能脫離這顆星球..."
    },
    {
      "speaker": "Sbaak",
      "text": "等待救援? 但也要有辦法發送求救訊號... (思考)\r\n對了...! 將沃爾特通訊陣列組裝起來?"
    },
    {
      "speaker": "Sbaak",
      "text": "應該蠻有機會的，我記得剛才在備品清單上看到，\r\n貨艙還有備用零件，只要再... (大腦飛速的思索)"
    },
    {
      "speaker": "Sbaak",
      "text": "總之先返回伊薩卡號，我想一定會有辦法的。"
    }
  ]
},
  "chapter03-section-3": {
  "characterDelaySeconds": 0.02,
  "speakers": [
    "Sbaak",
    "Echo",
    "飛航系統AI"
  ],
  "lines": [
    {
      "speaker": "Sbaak",
      "text": "..."
    },
    {
      "speaker": "Sbaak",
      "text": "…昨晚睡得比想像中安穩。"
    },
    {
      "speaker": "Sbaak",
      "text": "如果通訊設備真的還能修復…\r\n也許不只是活下去..."
    },
    {
      "speaker": "Sbaak",
      "text": "還有回家的可能。"
    },
    {
      "speaker": "Sbaak",
      "text": "不過睡了一晚，肚子好餓啊...\r\n要有體力工作的話，至少要吃頓飽飯。"
    },
    {
      "speaker": "Sbaak",
      "text": "背包裡還有緊急口糧，但為了長遠打算，最好不要只依賴口糧，\r\n應該要能從這個星球獲取新鮮的食物。"
    },
    {
      "speaker": "",
      "text": "(為了生存需要妥善管理我的身體屬性 )"
    },
    {
      "speaker": "Sbaak",
      "text": "嘿~ 飛航電腦，你在嗎?\r\n再說明一下我應該控管我身體的哪些機能?"
    },
    {
      "speaker": "飛航系統AI",
      "text": "根據伊薩卡號船員飛行手冊 - 第八章 第二小節，\r\n當船員在未知環境面臨生存與健康風險情況時，應妥善遵循的注意事項 :"
    },
    {
      "speaker": "飛航系統AI",
      "text": "管理體力 : 休息與睡眠可以適度恢復體力，但會消耗比較多時間。\r\n部分工作與環境作業，會要求船員擁有一定程度的體力才會授權啟動。"
    },
    {
      "speaker": "飛航系統AI",
      "text": "管理飲食 : 長時間飢餓會影響行動速度，低於某個程度會影響身體機能對操作器具的安全性。\r\n建議 - 保持充足的飲食並最大程度收集一切環境可提供之可食用資源。"
    },
    {
      "speaker": "飛航系統AI",
      "text": "管理飲水 : 缺水也會影響移動速度，長期缺水甚至會導致生命危險。\r\n注意 - 在未知環境中最先需要確保的就是穩定的飲用水資源，並且要注意飲用水的安全性。"
    },
    {
      "speaker": "飛航系統AI",
      "text": "管理精神 : 精神是最重要的狀態，要與設備互動、資料的閱讀、通訊解碼...\r\n都仰賴保持一定的精神力，當生理需求頻繁過低，會導致精神不濟甚至崩潰。\r\n請一定要保持堅強的求生意志，並且持續保持著希望。"
    },
    {
      "speaker": "Sbaak",
      "text": "...(聽完這些注意事項)\r\n我有種難以言喻的情緒..."
    },
    {
      "speaker": "Sbaak",
      "text": "但不管怎麼說，還是先找出通訊陣列的零件，再來思考對策吧!"
    }
  ]
},
  "chapter03-section-4": {
  "characterDelaySeconds": 0.02,
  "speakers": [
    "Sbaak",
    "Echo"
  ],
  "lines": [
    {
      "speaker": "Sbaak",
      "text": "收集完通訊陣列的零件了，工具組也準備好了..."
    },
    {
      "speaker": "Sbaak",
      "text": "接下來只要組裝起來，就可以掃描地球殖民地的方位訊號了。"
    },
    {
      "speaker": "Sbaak",
      "text": "先調出通訊陣列的維修藍圖，把它存到工程平板...\r\n(我前往臨時電腦準備存取相關資料)"
    }
  ]
},
  "chapter03-section-5": {
  "characterDelaySeconds": 0.02,
  "speakers": [
    "Sbaak",
    "Echo",
    "飛船工程電腦AI"
  ],
  "lines": [
    {
      "speaker": "Sbaak",
      "text": "我檢查一下...共振發電效率...\r\n現在只有6%..."
    },
    {
      "speaker": "Sbaak",
      "text": "那不就是快沒電了嗎? (我感到莫名其妙)"
    },
    {
      "speaker": "飛船工程電腦AI",
      "text": "共振電晶體零件損毀，請更換電晶體。"
    },
    {
      "speaker": "Sbaak",
      "text": "共振電晶體!? 這麼基本的零件也會有問題?\r\n船上會有備料嗎?"
    },
    {
      "speaker": "Sbaak",
      "text": "(努力回想貨運清單) 但我好像不記得有準備相關的備品..."
    },
    {
      "speaker": "Sbaak",
      "text": "嘿~ 飛航電腦，伊薩卡號上有共振電晶體的備品嗎?"
    },
    {
      "speaker": "飛船工程電腦AI",
      "text": "...搜尋庫房點交清單\r\n...搜尋貨物運輸清單"
    },
    {
      "speaker": "飛船工程電腦AI",
      "text": "經過查詢，原本的機電室工程貨艙在FLP — Forced Landing Protocol\n迫降程序時已經依流程緊急脫離。"
    },
    {
      "speaker": "飛船工程電腦AI",
      "text": "現在伊薩卡號上沒有共振電晶體的備品元件。\r\n建議尋找替代元件。"
    },
    {
      "speaker": "Sbaak",
      "text": "(我眉頭一鎖...) 這下麻煩了。"
    },
    {
      "speaker": "Sbaak",
      "text": "飛航電腦，有辦法查出貨艙的脫離座標嗎?"
    },
    {
      "speaker": "飛船工程電腦AI",
      "text": "我會調出工程貨艙緊急脫離程序時的歷程記錄。"
    },
    {
      "speaker": "飛船工程電腦AI",
      "text": "[04:16:42] CARGO MODULE C-02 ...... EMERGENCY SEPARATION CONFIRMED\n[04:17:08] MAIN PROPULSION ........ THRUST LOSS / AUTO-RESTART FAILED\n[04:17:31] FLIGHT CONTROL ......... FORCED LANDING PROTOCOL INITIATED\n[04:18:07] IMPACT DETECTED ........ ALL FLIGHT SYSTEMS OFFLINE"
    },
    {
      "speaker": "飛船工程電腦AI",
      "text": "工程貨艙在 [04:16:42] 時啟動脫離，\r\n我無法定位這顆星球的座標系統，所以沒有座標地點資訊。"
    },
    {
      "speaker": "飛船工程電腦AI",
      "text": "但是根據伊薩卡號的事件紀錄儀顯示，\r\n貨艙脫離時間：[04:16:42]。船體撞擊時間：[04:18:07]。\r\n兩者相隔 85 秒。"
    },
    {
      "speaker": "飛船工程電腦AI",
      "text": "脫離時航速約每秒 214 公尺；撞擊前已下降至每秒 96 公尺。\r\n正在比對期間航向與減速曲線……"
    },
    {
      "speaker": "飛船工程電腦AI",
      "text": "依照脫離時間、飛行速度與最後航跡反向推算，\r\n貨艙應於主船墜毀點前方約 8.6 公里範圍內落地。"
    },
    {
      "speaker": "",
      "text": "(地圖上標示出一片預測搜尋區域。)"
    },
    {
      "speaker": "飛船工程電腦AI",
      "text": "已標記預測墜落區。受氣流與貨艙翻滾影響，\r\n實際位置可能存在約四百公尺誤差。"
    },
    {
      "speaker": "Sbaak",
      "text": "8.6公里...還真遠啊... (我思考著該怎麼搜尋的方法)"
    },
    {
      "speaker": "Sbaak",
      "text": "但是擴大一點搜尋範圍也是必要的，趁天黑前稍微往西邊勘查一下好了。"
    },
    {
      "speaker": "Sbaak",
      "text": "記得帶一點口糧跟飲水，以免回程耽擱了。"
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
  "chapter03-scene2-start": {
  "characterDelaySeconds": 0.02,
  "speakers": [
    "Sbaak",
    "Echo"
  ],
  "lines": [
    {
      "speaker": "Sbaak",
      "text": "這裡果然也有掉落的貨物，我確認看看有什麼可以取回的。"
    },
    {
      "speaker": "Sbaak",
      "text": "咦? 那個岩壁的下層有一個很像公司的貨物...再靠過去調查看看。"
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

export const STORY_EVENT_FLOWS: Readonly<Record<string, ChapterFlowDefinition>> = {
  [CHAPTER_3_START_FLOW.id]: CHAPTER_3_START_FLOW,
};
// CHAPTER_SCRIPT_EDITOR_GENERATED_END
