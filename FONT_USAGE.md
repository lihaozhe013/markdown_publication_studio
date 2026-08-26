# Bundled Font Usage

This project bundles and embeds the following font families in its themes and
PDF page-number output. The supplied Adobe variable font files are used under
their upstream names; the requested “Source Hans Sans/Serif” migration is
implemented with the official Source Han Sans/Serif SC families.

| Font family         | Bundled files                                                                                                         | Project usage                                                                 | License and upstream                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| JetBrains Mono      | `themes/fonts/JetBrains_Mono/static/*.ttf`                                                                            | Code blocks and selectable PDF page-number font                               | SIL Open Font License 1.1; [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono)        |
| Source Han Sans SC  | `themes/fonts/SourceHanSansSC-VF.ttf`                                                                                 | Rose and Github CJK sans-serif text; selectable PDF page-number font          | SIL Open Font License 1.1; [Source Han Sans](https://github.com/adobe-fonts/source-han-sans)   |
| Source Han Serif SC | `themes/fonts/SourceHanSerifSC-VF.ttf`                                                                                | Modern Serif CJK serif text; selectable PDF page-number font                  | SIL Open Font License 1.1; [Source Han Serif](https://github.com/adobe-fonts/source-han-serif) |
| Source Sans 3       | `themes/fonts/SourceSans3-VariableFont_wght.ttf`, `themes/fonts/SourceSans3-Italic-VariableFont_wght.ttf`             | Rose theme default sans-serif text; selectable PDF page-number font          | SIL Open Font License 1.1; [Source Sans](https://github.com/adobe-fonts/source-sans)           |
| Source Serif 4      | `themes/fonts/SourceSerif4-VariableFont_opsz,wght.ttf`, `themes/fonts/SourceSerif4-Italic-VariableFont_opsz,wght.ttf` | Modern Serif theme Latin serif text; selectable PDF page-number font          | SIL Open Font License 1.1; [Source Serif](https://github.com/adobe-fonts/source-serif)         |
| Inter               | `themes/fonts/Inter/static/*.ttf`                                                                                     | Github theme and desktop UI fallback                                          | SIL Open Font License 1.1; see `themes/fonts/Inter/OFL.txt`                                    |
| Open Sans           | `themes/fonts/Open_Sans/static/*.ttf`                                                                                 | Github theme fallback                                                         | SIL Open Font License 1.1; see `themes/fonts/Open_Sans/OFL.txt`                                |

The font files are third-party assets, not original works of this project. Their
copyright notices and license terms remain applicable. Redistribution of this
project should preserve this declaration, the bundled license notices, and the
upstream license terms. The fonts are bundled with the application and embedded
into generated publications; they are not sold as standalone font software.

The former JetBrainsMono Nerd Font, Noto Sans SC, Noto Serif SC, Anthropic Serif
Web Text, and ZhuqueFangsong assets are no longer part of the project.
