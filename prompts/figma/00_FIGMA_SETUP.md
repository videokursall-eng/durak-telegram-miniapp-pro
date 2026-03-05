# Figma — настройка дизайн-системы (PRO)

## Цель
Сделать дизайн “как студия”: консистентные компоненты, токены, состояния.

## Шаги
1) Создай файл Figma: `Durak PRO — Telegram Mini App`.
2) Страницы:
- `00 Foundations` (цвета, типографика, spacing, radius, shadows)
- `01 Components` (Buttons, Badges, Cards, Panels)
- `02 Screens` (Welcome, Lobby, Room, GameTable, Result)
- `03 Prototypes` (клики и переходы)

3) Токены:
- colors: background felt, primary, danger, accent, text
- spacing: 4/8/12/16/24
- radius: 12/16/24
- typography: H1/H2/body/caption

4) Компоненты (минимум):
- Button (primary/secondary/danger/disabled/loading)
- PlayerBadge (name + cardsCount + role)
- ActionBar (row of buttons)
- Card (front/back, selected, disabled)
- Pile (deck/discard/trump)

## Что просить у Figma AI (пример)
- “Сгенерируй 5 вариантов HUD панели действий для карточной игры, в стиле modern casino, учитывая Telegram dark/light.”
- “Создай компонент PlayerBadge с состояниями attacker/defender/active.”

## Хэнд-офф
- включи Dev Mode
- экспорт ассетов (SVG/PNG) в папку `apps/web/src/assets/ui`
