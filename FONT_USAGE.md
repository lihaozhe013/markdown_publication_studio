# Bundled Font Usage

This project bundles and embeds the following font families in its themes and
PDF page-number output. The supplied Adobe variable font files are used under
their upstream names; the requested “Source Hans Sans/Serif” migration is
implemented with the official Source Han Sans/Serif SC families.

| Font family         | Bundled files                                                                                                         | Project usage                                                                                          | License and upstream                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| JetBrains Mono      | `themes/fonts/JetBrains_Mono/static/*.ttf`                                                                            | Code blocks and selectable PDF page-number font                                                        | SIL Open Font License 1.1; [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono)        |
| Source Han Sans SC  | `themes/fonts/SourceHanSansSC-VF.ttf`                                                                                 | Rose and Github CJK sans-serif text; selectable PDF page-number font                                   | SIL Open Font License 1.1; [Source Han Sans](https://github.com/adobe-fonts/source-han-sans)   |
| Source Han Serif SC | `themes/fonts/SourceHanSerifSC-VF.ttf`                                                                                | Modern Serif CJK serif text; selectable PDF page-number font                                           | SIL Open Font License 1.1; [Source Han Serif](https://github.com/adobe-fonts/source-han-serif) |
| Source Sans 3       | `themes/fonts/SourceSans3-VariableFont_wght.ttf`, `themes/fonts/SourceSans3-Italic-VariableFont_wght.ttf`             | Rose theme default sans-serif text; selectable PDF page-number font                                    | SIL Open Font License 1.1; [Source Sans](https://github.com/adobe-fonts/source-sans)           |
| Source Serif 4      | `themes/fonts/SourceSerif4-VariableFont_opsz,wght.ttf`, `themes/fonts/SourceSerif4-Italic-VariableFont_opsz,wght.ttf` | Modern Serif theme Latin serif text; selectable PDF page-number font                                   | SIL Open Font License 1.1; [Source Serif](https://github.com/adobe-fonts/source-serif)         |
| EB Garamond         | `themes/fonts/EB_Garamond/*.ttf`                                                                                      | Academic Paper and Classic Book Latin text, with Source Han Serif SC for CJK                           | SIL Open Font License 1.1; see `themes/fonts/EB_Garamond/OFL.txt`                              |
| IBM Plex Sans       | `themes/fonts/IBM_Plex_Sans/*.ttf`                                                                                    | Minimal Print, Notebook, Solarized Light, and Nordic Light Latin text, with Source Han Sans SC for CJK | SIL Open Font License 1.1; see `themes/fonts/IBM_Plex_Sans/OFL.txt`                            |
| Inter               | `themes/fonts/Inter/static/*.ttf`                                                                                     | Github theme typography                                                                                | SIL Open Font License 1.1; see `themes/fonts/Inter/OFL.txt`                                    |
| Open Sans           | `themes/fonts/Open_Sans/static/*.ttf`                                                                                 | Github theme fallback                                                                                  | SIL Open Font License 1.1; see `themes/fonts/Open_Sans/OFL.txt`                                |

EB Garamond and IBM Plex Sans were downloaded from the Google Fonts repository
at commit `9862abc066c9b83bf84c3e8ed1fc2d8d48f9bbf0`, from
[`ofl/ebgaramond`](https://github.com/google/fonts/tree/9862abc066c9b83bf84c3e8ed1fc2d8d48f9bbf0/ofl/ebgaramond)
and
[`ofl/ibmplexsans`](https://github.com/google/fonts/tree/9862abc066c9b83bf84c3e8ed1fc2d8d48f9bbf0/ofl/ibmplexsans),
respectively. Both include their upstream copyright notices and SIL OFL 1.1
license files. The fonts are variable TTFs with normal and italic faces.

The font files are third-party assets, not original works of this project. Their
copyright notices and license terms remain applicable. Redistribution of this
project should preserve this declaration, the bundled license notices, and the
upstream license terms. The fonts are bundled with the application and embedded
into generated publications; they are not sold as standalone font software.

The former JetBrainsMono Nerd Font, Noto Sans SC, Noto Serif SC, Anthropic Serif
Web Text, and ZhuqueFangsong assets are no longer part of the project.
