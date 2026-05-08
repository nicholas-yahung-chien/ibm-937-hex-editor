# IBM-937 DBCS Hex Inspector Web Site 規劃文件

## 專案目標

建立一個可在線上使用的 IBM-937 / EBCDIC DBCS 檢查與編輯工具。

網站功能包含：

- UTF-8 字符串輸入
- IBM-937 編碼轉換
- 顯示 IBM-937 hex bytes
- ISPF-style 上下碼 hex 編輯器
- IBM-937 → UTF-8 解碼預覽
- DBCS SO/SI 缺失檢查
- DBCS/SBCS 寬度正確顯示

---

# 1. 系統架構

採用純前端靜態網站架構：

```text
UTF-8 Input
    ↓
IBM-937 Encoder
    ↓
Hex Byte Array
    ↓
ISPF-style Hex Editor
    ↓
Finish Edit
    ↓
IBM-937 Decoder
    ↓
UTF-8 Preview
```

整個系統不需要後端伺服器。

適合部署於：

- GitHub Pages
- Cloudflare Pages
- Netlify

---

# 2. 核心功能規劃

## 2.1 UTF-8 輸入區

使用者輸入 UTF-8 字符串：

```text
HELLO中文WORLD
```

點擊：

```text
轉換 IBM-937
```

系統將：

1. 轉換成 IBM-937 bytes
2. 插入必要 SO/SI
3. 顯示 hex bytes

---

## 2.2 IBM-937 Codec 模組

建立：

```ts
unicodeToIbm937(char): number[]
ibm937ToUnicode(bytes): string
```

功能：

- SBCS → 1 byte
- DBCS → SO + 2-byte pair + SI
- 支援連續 DBCS 區段最佳化

例如：

```text
HELLO中文
```

可能轉成：

```text
c8 c5 d3 d3 d6 0e 42 7f 51 aa 0f
```

---

# 3. Hex 編輯器設計

## 3.1 ISPF-style 上下碼顯示

IBM ISPF 風格：

byte：

```text
0e
```

顯示成：

```text
0
e
```

例如：

```text
0e0f
```

顯示為：

```text
00
ef
```

---

## 3.2 編輯方式

### 支援：

- 方向鍵移動
- 上下切換 nibble
- 輸入 hex 字元
- Backspace/Delete
- Byte 刪除

---

## 3.3 Byte 刪除規則

若 high nibble 與 low nibble 都清空：

```text
__
__
```

代表刪除整個 byte。

右側 bytes 自動左移：

```text
11 22 33
```

刪除 `22`：

```text
11 33
```

---

## 3.4 補零規則

若只輸入一個 nibble：

```text
e_
```

完成編輯後：

```text
e0
```

若：

```text
_f
```

則：

```text
0f
```

---

# 4. UTF-8 預覽窗格

## 4.1 解碼顯示

完成編輯後：

```text
IBM-937 bytes
    ↓
decode
    ↓
UTF-8 preview
```

---

## 4.2 等寬顯示

必須正確反映：

```text
1 DBCS char = 2 SBCS width
```

因此不能單純使用 textarea。

建議：

```html
<span class="sbcs">A</span>
<span class="dbcs">漢</span>
```

CSS：

```css
.sbcs {
  display: inline-block;
  width: 1ch;
}

.dbcs {
  display: inline-block;
  width: 2ch;
}
```

---

## 4.3 SO/SI 顯示

SO/SI 顯示為：

- 紅色標記
- 1 SBCS 寬度

例如：

```html
<span class="shift-marker">◆</span>
```

CSS：

```css
.shift-marker {
  display: inline-block;
  width: 1ch;
  color: red;
}
```

---

# 5. DBCS 檢查器

## 5.1 功能

檢查：

- Missing SO
- Missing SI
- Invalid DBCS Pair
- Unmatched SO
- Unmatched SI
- Ambiguous region

---

## 5.2 診斷型別

```ts
type DiagnosticKind =
  | "MISSING_SO"
  | "MISSING_SI"
  | "INVALID_DBCS_PAIR"
  | "UNMATCHED_SO"
  | "UNMATCHED_SI"
  | "AMBIGUOUS";
```

---

## 5.3 UI 顯示

### 錯誤：

- 紅色背景

### 可疑：

- 黃色背景

### Hover：

顯示 tooltip：

```text
Missing SI before byte 0xF1
```

---

# 6. 前端技術選型

建議：

```text
Vite + React + TypeScript
```

原因：

- 快速
- 靜態部署容易
- 元件化適合 Hex Editor
- TypeScript 適合 byte/nibble 狀態管理

---

# 7. 專案結構

```text
src/
  codec/
    ibm937.ts
    tables.ts

  inspector/
    inspect937.ts

  components/
    Utf8InputPanel.tsx
    HexEditor.tsx
    DecodedPreview.tsx
    DiagnosticsPanel.tsx

  styles/
    hex-editor.css

  App.tsx
```

---

# 8. 狀態管理

建議：

```ts
type ByteCell = {
  value: number;
  selected: boolean;
  diagnostic?: string;
}
```

內部使用：

```ts
ByteCell[]
```

不要使用 string。

---

# 9. 鍵盤控制規劃

## 左右鍵

移動 byte cursor。

## 上下鍵

切換：

- high nibble
- low nibble

## Hex 輸入

接受：

```text
0-9
a-f
A-F
```

---

# 10. UI 視覺設計

## 10.1 風格

建議：

- IBM 3270 / ISPF 風格
- 深色背景
- 綠字
- 等寬字型

---

## 10.2 字型

```css
font-family:
  "IBM Plex Mono",
  "Cascadia Mono",
  "Consolas",
  monospace;
```

---

## 10.3 Layout

建議三欄：

```text
+----------------+----------------------+----------------+
| UTF-8 Input    | Hex Editor           | UTF-8 Preview  |
+----------------+----------------------+----------------+
```

---

# 11. 自動化測試

## Unit Test

測試：

- UTF8 → 937
- 937 → UTF8
- SO/SI 插入
- Missing SO
- Missing SI

---

## UI Test

測試：

- nibble editing
- delete byte
- cursor movement
- width rendering

---

## 建議工具

```text
Vitest
Testing Library
Playwright
```

---

# 12. 自動化部署

## GitHub Pages

流程：

```text
push main
    ↓
npm ci
    ↓
npm run test
    ↓
npm run build
    ↓
deploy dist/
```

---

## GitHub Actions

建立：

```text
.github/workflows/deploy.yml
```

---

## 備選方案

### Cloudflare Pages

優點：

- 更快 CDN
- Preview Deployments
- 更好多人協作

---

# 13. 開發里程碑

## Phase 1

IBM-937 codec

---

## Phase 2

UTF-8 → IBM-937 顯示

---

## Phase 3

ISPF-style hex editor

---

## Phase 4

IBM-937 → UTF-8 preview

---

## Phase 5

DBCS diagnostics

---

## Phase 6

Testing + CI/CD

---

# 14. 未來可擴充功能

## 支援更多 EBCDIC code page

例如：

- IBM-930
- IBM-939
- IBM-935

---

## Binary File Upload

允許：

```text
upload .dat
```

直接分析。

---

## 差異比較模式

比較：

```text
original bytes
vs
edited bytes
```

---

## Export 功能

輸出：

- hex dump
- binary
- UTF-8 text

---

# 15. 建議優先順序

最優先：

1. IBM-937 codec
2. byte model
3. hex editor
4. decoder preview

因為：

所有檢查功能都建立於這些基礎之上。

