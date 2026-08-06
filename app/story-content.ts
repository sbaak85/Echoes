import type { ChapterFlowDefinition } from "./chapter-flow-manager";
import type { InteractionDialogueScript } from "./interaction-flow";

/* CHAPTER_SCRIPT_EDITOR_DATA_BEGIN
ew0KICAic2NoZW1hVmVyc2lvbiI6IDIsDQogICJjaGFwdGVycyI6IFsNCiAgICB7DQogICAgICAiaWQiOiAicHJvbG9ndWUiLA0KICAgICAgInRhYk5hbWUiOiAi5bqP56ugIiwNCiAgICAgICJ0aXRsZSI6ICLkurrpoZ7nmoTluIzmnJsiLA0KICAgICAgImNoYXB0ZXJOdW1iZXIiOiAwLA0KICAgICAgInN1YnRpdGxlRXZlbnRzIjogW10sDQogICAgICAiZGlhbG9ndWVTZWN0aW9ucyI6IFtdLA0KICAgICAgInN0b3J5VHJpZ2dlckRpYWxvZ3VlcyI6IFtdDQogICAgfSwNCiAgICB7DQogICAgICAiaWQiOiAiY2hhcHRlcjAyIiwNCiAgICAgICJ0YWJOYW1lIjogIuesrOS6jOeroCIsDQogICAgICAidGl0bGUiOiAi56qB5aaC5YW25L6G55qE5oSP5aSWIiwNCiAgICAgICJjaGFwdGVyTnVtYmVyIjogMiwNCiAgICAgICJzdWJ0aXRsZUV2ZW50cyI6IFtdLA0KICAgICAgImRpYWxvZ3VlU2VjdGlvbnMiOiBbXSwNCiAgICAgICJzdG9yeVRyaWdnZXJEaWFsb2d1ZXMiOiBbXQ0KICAgIH0sDQogICAgew0KICAgICAgImlkIjogImNoYXB0ZXIwMyIsDQogICAgICAidGFiTmFtZSI6ICLnrKzkuInnq6AiLA0KICAgICAgInRpdGxlIjogIuWtmOa0u+eahOa6luWCmSIsDQogICAgICAiY2hhcHRlck51bWJlciI6IDMsDQogICAgICAic3VidGl0bGVFdmVudHMiOiBbDQogICAgICAgIHsNCiAgICAgICAgICAiaWQiOiAiY2hhcHRlcjAzLW9wZW5pbmctY2FyZCIsDQogICAgICAgICAgIm5hbWUiOiAi56ys5LiJ56ug6ZaL5aC05a2X5bmVIiwNCiAgICAgICAgICAidGV4dCI6ICLmmYLplpPvvJrlopzokL3lvoznrKwz5aSp77yM5riF5pmoXHJcbuWcsOm7nu+8mumjm+iIueaumOmquOaXgeeahOiHqOaZgueHn+WcsFxyXG7liY3mj5DvvJrouqvpq5ToiIfnsr7npZ7ni4DmhYvlsJrmnKrmgaLlvqnvvIznj77mnInoo5zntabljbPlsIfogJfnm6HvvIxcclxu5b+F6aCI6ZaL5aeL5bCL5om+56mp5a6a55qE6aOf54mp5L6G5rqQ77yM5ZCM5pmC5Yqg5Zu654ef5Zyw5Lim5qqi5L+u6Zu76IWm6IiH6YCa6KiK6Kit5YKZ44CCIiwNCiAgICAgICAgICAidHJpZ2dlclR5cGUiOiAiY2hhcHRlclN0YXJ0IiwNCiAgICAgICAgICAidHJpZ2dlclZhbHVlIjogIiIsDQogICAgICAgICAgInRyaWdnZXJDb3VudCI6IDEsDQogICAgICAgICAgImRlbGF5QmVmb3JlTXMiOiAyMDAwLA0KICAgICAgICAgICJmYWRlSW5NcyI6IDE1MDAsDQogICAgICAgICAgImhvbGRNcyI6IDgwMDAsDQogICAgICAgICAgImZhZGVPdXRNcyI6IDE1MDAsDQogICAgICAgICAgImRlbGF5QWZ0ZXJNcyI6IDE1MDAsDQogICAgICAgICAgImtlZXBCbGFjayI6IHRydWUsDQogICAgICAgICAgImxvY2tJbnB1dCI6IHRydWUNCiAgICAgICAgfQ0KICAgICAgXSwNCiAgICAgICJkaWFsb2d1ZVNlY3Rpb25zIjogWw0KICAgICAgICB7DQogICAgICAgICAgImlkIjogImNoYXB0ZXIwMy1zdGFydCIsDQogICAgICAgICAgIm5hbWUiOiAi56ys5LiJ56ugX1N0YXJ0IiwNCiAgICAgICAgICAiZGlhbG9ndWUiOiB7DQogICAgICAgICAgICAiY2hhcmFjdGVyRGVsYXlTZWNvbmRzIjogMC4wMiwNCiAgICAgICAgICAgICJzcGVha2VycyI6IFsNCiAgICAgICAgICAgICAgIlNiYWFrIiwNCiAgICAgICAgICAgICAgIj8/PyIsDQogICAgICAgICAgICAgICLpo5voiLnovJTliqnns7vntbEiLA0KICAgICAgICAgICAgICAiRWNobyINCiAgICAgICAgICAgIF0sDQogICAgICAgICAgICAibGluZXMiOiBbDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICIiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuiIueiJmeWFp+WCs+S+huS6huapn+aisOWVn+WLleeahOWWgOWZoOiBsu+8jOa3t+iRl+miqOmRvemAsuepuumameeahOiBsumfsy4uLiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIiIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi6YKE5pyJ5L2O5b6u55qE6Zu75rWB6Zuc6Z+z6IiH6YeR5bGs5p2/6ayG5YuV5LiN5pmC56Kw5pKe55qE6IGy6Z+/44CCIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiPz8/IiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICIuLi4uLi4iDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICLpo5voiLnovJTliqnns7vntbEiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuS6i+aVheW+jOaZgumWk+KApuKApuS6lOWNgeWFq+Wwj+aZgu+8jOS6jOWNgeS4gOWIhumQmOOAgiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIumjm+iIuei8lOWKqeezu+e1sSIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi55Sf5ZG954uA5oWL6KmV5Lyw77ya6LyV5bqm6ISr5rC044CB552h55yg5LiN6Laz77yMXG7lj7PlgbTogovpg6jmjKvlgrflsJrmnKrmgaLlvqnjgIIiDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICJTYmFhayIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi5oiR5oSf6Ka65b6X5Yiw44CC77yI6Lqr6auU55qE55a855eb5Zyo5o+Q6YaS6JGX5oiRLi4u77yJIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAi6aOb6Ii56LyU5Yqp57O757WxIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLlu7rorbAgLSDoq4vnubznuozkvJHmga/jgIIiDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICJTYmFhayIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi6Ii56ImZ5YWn55qE6aOf54mp5Y+q5Ymp5YWp5YyF77yM5rC05Lmf5pKQ5LiN5Yiw5piO5aSp44CCIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiU2JhYWsiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuWGjei6uuS4i+WOu++8jOaDheazgeS5n+S4jeacg+iHquW3seaUueWWhOOAgiINCiAgICAgICAgICAgICAgfQ0KICAgICAgICAgICAgXQ0KICAgICAgICAgIH0NCiAgICAgICAgfSwNCiAgICAgICAgew0KICAgICAgICAgICJpZCI6ICJjaGFwdGVyMDMtc2VjdGlvbi0xIiwNCiAgICAgICAgICAibmFtZSI6ICLnrKzkuInnq6BfU2VjdGlvbiAxIiwNCiAgICAgICAgICAiZGlhbG9ndWUiOiB7DQogICAgICAgICAgICAiY2hhcmFjdGVyRGVsYXlTZWNvbmRzIjogMC4wMiwNCiAgICAgICAgICAgICJzcGVha2VycyI6IFsNCiAgICAgICAgICAgICAgIlNiYWFrIiwNCiAgICAgICAgICAgICAgIkVjaG8iLA0KICAgICAgICAgICAgICAi6aOb6Ii56Zu76IWmIiwNCiAgICAgICAgICAgICAgIumjm+iIuei8lOWKqeezu+e1sSINCiAgICAgICAgICAgIF0sDQogICAgICAgICAgICAibGluZXMiOiBbDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICIiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuacqueGhOa7heeahOeHn+eBq+S7jeeHg+eHkuiRl+mkmOeHvO+8jOmjm+iIueaXgeaVo+iQveiRl+WHjOS6gueahOmHkeWxrOadv+OAgee3muadkOiIh+S4gOWghuaOieiQveeahOiyqOeuseOAgiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLlj6rmmK/og73nq5notbfkvobogIzlt7LigKbouqvpq5Tni4Dms4Hmr5TmmKjlpKnpgoTns5/jgIIiDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICLpo5voiLnovJTliqnns7vntbEiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuWBtea4rOWIsOermeeri+W5s+ihoeS4jeepqeWumuOAglxyXG7lho3mrKHlu7rorbDlgZzmraLmtLvli5XkuKbkv53mjIHkvJHmga/jgIIiDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICJTYmFhayIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi6Zec6ZaJ5YGl5bq35o+Q6YaS6YCa55+l44CCKOmAmeWAi0FJ55qE56mN5qW15bqm6Kit5a6a5b6X5aSq6auY5LqGKSINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIumjm+iIuei8lOWKqeezu+e1sSIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi5YGl5bq35o+Q6YaS5bey6ZmN5L2O6IezIC0g5b+F6KaB6K2m5ZGK44CCIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiU2JhYWsiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuW+iOWlve+8jOiHs+WwkeePvuWcqOmdnOS4gOm7nuS6hu+8jOipsuS+huWIl+aVtOS4gOS4i+S7iuWkqeimgeiZleeQhueahOS6i+mghS4uLiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLoiZnlpJbnmoTosqjnrrEuLi7lpb3lg4/pgoTlnKjvvIzopoHmqqLmn6XkuIDkuIvosqjniakuLi5cclxu6Iez5bCR6KaB5Y+W5Zue5LiA5Lqb57eK5oCl5Y+j57On6Lef5reo5rC0Li4u5pyJ5aSa5bCR5ou/5aSa5bCR44CCIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiU2JhYWsiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIumChOimgea4rOippuaYqOWkqeaetuWcqOWklumdoueahOWFieazouWFhembu+WZqO+8jOeci+iDveS4jeiDveWVn+WLlembu+iFpueahOWuieWFqOaooeW8jy4uLiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLnuL3kuYvlhYjlrozmiJDkuIDkupvpgLLluqblkKchIOS4jeeEtumAo+a0u+S4i+WOu+WPr+iDvemDveaYr+WAi+WVj+mhjC4uLiINCiAgICAgICAgICAgICAgfQ0KICAgICAgICAgICAgXQ0KICAgICAgICAgIH0NCiAgICAgICAgfSwNCiAgICAgICAgew0KICAgICAgICAgICJpZCI6ICJjaGFwdGVyMDMtc2VjdGlvbi0yIiwNCiAgICAgICAgICAibmFtZSI6ICLnrKzkuInnq6BfU2VjdGlvbiAyIiwNCiAgICAgICAgICAiZGlhbG9ndWUiOiB7DQogICAgICAgICAgICAiY2hhcmFjdGVyRGVsYXlTZWNvbmRzIjogMC4wMiwNCiAgICAgICAgICAgICJzcGVha2VycyI6IFsNCiAgICAgICAgICAgICAgIlNiYWFrIiwNCiAgICAgICAgICAgICAgIkVjaG8iDQogICAgICAgICAgICBdLA0KICAgICAgICAgICAgImxpbmVzIjogWw0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICIo6aOy55So5a6M5LiA55O25reo5rC05b6M77yM5oiR5b235b2/542y5b6X5LqG5pWR6LSWKSINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLpm5bnhLbnj77lnKjlpKnoibLpgoTml6nvvIzkvYbpgoTmmK/lpJrkvJHmga/orpPouqvpq5TppIrlgrfmr5TovIPlpb0uLi5cclxu5pu05L2V5rOB6YCZ6aGG5pif55CD55qE55m95aSp5qC55pys5LiN5puJ5b6X5pyJ5aSa6ZW35ZWKISINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLlhYjlm57kvIrolqnljaHomZ/vvIzmiJHmh4noqbLopoHlpb3lpb3opo/lioPkuIDkuIvoqbLmgI7purzmiY3og73ohKvpm6LpgJnpoYbmmJ/nkIMuLi4iDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICJTYmFhayIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi562J5b6F5pWR5o+0PyDkvYbkuZ/opoHmnInovqbms5XnmbzpgIHmsYLmlZHoqIromZ8uLi4gKOaAneiAgylcclxu5bCN5LqGLi4uISDlsIfmsoPniL7nibnpgJroqIrpmaPliJfntYToo53otbfkvoY/Ig0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiU2JhYWsiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuaHieipsuigu+acieapn+acg+eahO+8jOaIkeiomOW+l+WJm+aJjeWcqOWCmeWTgea4heWWruS4iueci+WIsO+8jFxyXG7osqjoiZnpgoTmnInlgpnnlKjpm7bku7bvvIzlj6ropoHlho0uLi4gKOWkp+iFpumjm+mAn+eahOaAnee0oikiDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICJTYmFhayIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi57i95LmL5YWI6L+U5Zue5LyK6Jap5Y2h6Jmf77yM5oiR5oOz5LiA5a6a5pyD5pyJ6L6m5rOV55qE44CCIg0KICAgICAgICAgICAgICB9DQogICAgICAgICAgICBdDQogICAgICAgICAgfQ0KICAgICAgICB9LA0KICAgICAgICB7DQogICAgICAgICAgImlkIjogImNoYXB0ZXIwMy1zZWN0aW9uLTMiLA0KICAgICAgICAgICJuYW1lIjogIuesrOS4ieeroF9TZWN0aW9uIDMiLA0KICAgICAgICAgICJkaWFsb2d1ZSI6IHsNCiAgICAgICAgICAgICJjaGFyYWN0ZXJEZWxheVNlY29uZHMiOiAwLjAyLA0KICAgICAgICAgICAgInNwZWFrZXJzIjogWw0KICAgICAgICAgICAgICAiU2JhYWsiLA0KICAgICAgICAgICAgICAiRWNobyINCiAgICAgICAgICAgIF0sDQogICAgICAgICAgICAibGluZXMiOiBbDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICJTYmFhayIsDQogICAgICAgICAgICAgICAgInRleHQiOiAiLi4uIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiU2JhYWsiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuKApuaYqOaZmuedoeW+l+avlOaDs+WDj+S4reWuieepqeOAgiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLlpoLmnpzpgJroqIroqK3lgpnnnJ/nmoTpgoTog73kv67lvqnigKZcclxu5Lmf6Kix5LiN5Y+q5piv5rS75LiL5Y67Li4uIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiU2JhYWsiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIumChOacieWbnuWutueahOWPr+iDveOAgiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLkuI3pgY7nnaHkuobkuIDmmZrvvIzogprlrZDlpb3ppJPllYouLi5cclxu6KaB5pyJ6auU5Yqb5bel5L2c55qE6Kmx77yM6Iez5bCR6KaB5ZCD6aCT6aO96aOv44CCIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiU2JhYWsiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIuiDjOWMheijoemChOaciee3iuaApeWPo+ezp++8jOS9hueCuuS6humVt+mBoOaJk+eul++8jOacgOWlveS4jeimgeWPquS+neiztOWPo+ezp++8jFxyXG7mh4noqbLopoHog73lvp7pgJnlgIvmmJ/nkIPnjbLlj5bmlrDprq7nmoTpo5/nianjgIIiDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICIiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIijngrrkuobnlJ/lrZjpnIDopoHlpqXlloTnrqHnkIbmiJHnmoTouqvpq5TlsazmgKcgKSINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIiIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi566h55CG6auU5YqbIDog5LyR5oGv6IiH552h55yg5Y+v5Lul6YGp5bqm5oGi5b6p6auU5Yqb77yM5L2G5pyD5raI6ICX5q+U6LyD5aSa5pmC6ZaT44CCIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLnrqHnkIbpo73otrMgOiDplbfmmYLplpPpo6LppJPmnIPlvbHpn7/ooYzli5XpgJ/luqbvvIzkvY7mlrzmn5DlgIvnqIvluqbmnIPnhKHms5XpgLLooYzkupLli5XjgIIiDQogICAgICAgICAgICAgIH0sDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICIiLA0KICAgICAgICAgICAgICAgICJ0ZXh0IjogIueuoeeQhumjsuawtCA6IOe8uuawtOS5n+acg+W9semfv+enu+WLlemAn+W6pu+8jOmVt+acn+e8uuawtOeUmuiHs+acg+WwjuiHtOeUn+WRveWNsemaquOAgiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIiIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi566h55CG57K+56WeIDog57K+56We5piv5pyA6YeN6KaB55qE54uA5oWL77yM6KaB57at5L+u5Zmo5p2Q44CB5oCd6ICD6Kej5rOV44CB5rGC55Sf5oSP5b+XLi4uXHJcbumDveS7sOiztOS/neaMgeS4gOWumueahOeyvuelnuWKm++8jOeVtueUn+eQhumcgOaxgumgu+e5gemBjuS9ju+8jOacg+WwjuiHtOeyvuelnuS4jea/n+eUmuiHs+W0qea9sOOAgiINCiAgICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLkvYbkuI3nrqHmgI7purzoqqrvvIzpgoTmmK/lhYjmib7lh7rpgJroqIrpmaPliJfnmoTpm7bku7bvvIzlho3kvobmgJ3ogIPlsI3nrZblkKchIg0KICAgICAgICAgICAgICB9DQogICAgICAgICAgICBdDQogICAgICAgICAgfQ0KICAgICAgICB9DQogICAgICBdLA0KICAgICAgInN0b3J5VHJpZ2dlckRpYWxvZ3VlcyI6IFsNCiAgICAgICAgew0KICAgICAgICAgICJpZCI6ICJjaGFwdGVyMDMtbG93ZXItbGVmdC1ub3QtcmVhZHkiLA0KICAgICAgICAgICJuYW1lIjogIuesrOS4ieeroF/lt6bkuIvliofmg4XljYBf5bCa5pyq5rqW5YKZ5aW9IiwNCiAgICAgICAgICAiZGlhbG9ndWUiOiB7DQogICAgICAgICAgICAiY2hhcmFjdGVyRGVsYXlTZWNvbmRzIjogMC4wMiwNCiAgICAgICAgICAgICJzcGVha2VycyI6IFsNCiAgICAgICAgICAgICAgIlNiYWFrIg0KICAgICAgICAgICAgXSwNCiAgICAgICAgICAgICJsaW5lcyI6IFsNCiAgICAgICAgICAgICAgew0KICAgICAgICAgICAgICAgICJzcGVha2VyIjogIlNiYWFrIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICLnj77lnKjmiJHpgoTmspLmupblgpnlpb3jgIIiDQogICAgICAgICAgICAgIH0NCiAgICAgICAgICAgIF0NCiAgICAgICAgICB9DQogICAgICAgIH0sDQogICAgICAgIHsNCiAgICAgICAgICAiaWQiOiAiY2hhcHRlcjAzX2JhY2twYWNrLXRlYWNoaW5nIiwNCiAgICAgICAgICAibmFtZSI6ICLog4zljIXoiIfkvb/nlKjmlZnlrbgiLA0KICAgICAgICAgICJkaWFsb2d1ZSI6IHsNCiAgICAgICAgICAgICJjaGFyYWN0ZXJEZWxheVNlY29uZHMiOiAwLjAyLA0KICAgICAgICAgICAgInNwZWFrZXJzIjogWw0KICAgICAgICAgICAgICAiU2JhYWsiLA0KICAgICAgICAgICAgICAiRWNobyINCiAgICAgICAgICAgIF0sDQogICAgICAgICAgICAibGluZXMiOiBbDQogICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAic3BlYWtlciI6ICJTYmFhayIsDQogICAgICAgICAgICAgICAgInRleHQiOiAi5aW977yM5pS26ZuG5Yiw5LiA6bue5ZCD55qE5LqG77yM5pyJ6bue57SvLi4u5omT6ZaL6IOM5YyF5Zad6bue5rC05ZCn44CCIg0KICAgICAgICAgICAgICB9LA0KICAgICAgICAgICAgICB7DQogICAgICAgICAgICAgICAgInNwZWFrZXIiOiAiIiwNCiAgICAgICAgICAgICAgICAidGV4dCI6ICIo5oiR5ZiX6Kmm57+75om+6IOM5YyF6KOh5pS26ZuG5Yiw55qE5Y+j57On6IiH6aOy5rC0KSINCiAgICAgICAgICAgICAgfQ0KICAgICAgICAgICAgXQ0KICAgICAgICAgIH0NCiAgICAgICAgfQ0KICAgICAgXQ0KICAgIH0NCiAgXQ0KfQ==
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
            "Echo"
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
              "speaker": "",
              "text": "管理體力 : 休息與睡眠可以適度恢復體力，但會消耗比較多時間。"
            },
            {
              "speaker": "",
              "text": "管理飽足 : 長時間飢餓會影響行動速度，低於某個程度會無法進行互動。"
            },
            {
              "speaker": "",
              "text": "管理飲水 : 缺水也會影響移動速度，長期缺水甚至會導致生命危險。"
            },
            {
              "speaker": "",
              "text": "管理精神 : 精神是最重要的狀態，要維修器材、思考解法、求生意志...\r\n都仰賴保持一定的精神力，當生理需求頻繁過低，會導致精神不濟甚至崩潰。"
            },
            {
              "speaker": "Sbaak",
              "text": "但不管怎麼說，還是先找出通訊陣列的零件，再來思考對策吧!"
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
    "Echo"
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
      "speaker": "",
      "text": "管理體力 : 休息與睡眠可以適度恢復體力，但會消耗比較多時間。"
    },
    {
      "speaker": "",
      "text": "管理飽足 : 長時間飢餓會影響行動速度，低於某個程度會無法進行互動。"
    },
    {
      "speaker": "",
      "text": "管理飲水 : 缺水也會影響移動速度，長期缺水甚至會導致生命危險。"
    },
    {
      "speaker": "",
      "text": "管理精神 : 精神是最重要的狀態，要維修器材、思考解法、求生意志...\r\n都仰賴保持一定的精神力，當生理需求頻繁過低，會導致精神不濟甚至崩潰。"
    },
    {
      "speaker": "Sbaak",
      "text": "但不管怎麼說，還是先找出通訊陣列的零件，再來思考對策吧!"
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

export const STORY_EVENT_FLOWS: Readonly<Record<string, ChapterFlowDefinition>> = {
  [CHAPTER_3_START_FLOW.id]: CHAPTER_3_START_FLOW,
};
// CHAPTER_SCRIPT_EDITOR_GENERATED_END
