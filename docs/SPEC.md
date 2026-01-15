# 動画合成サービス 仕様書

## 1. サービス概要

### 1.1 概要

ナナツカゼ「あのね」のグリーンバック動画に、ユーザーがアップロードした背景画像を合成し、オリジナル動画を生成するWebサービス。

### 1.2 提供する体験

1. Webページを開く
2. 背景画像を複数選択する（最大25枚）
3. 「生成」ボタンを押す
4. 数十秒待つ
5. 完成した動画をダウンロードする

### 1.3 提供しないもの

- 動画編集UI
- プレビュー機能
- アカウント機能
- 履歴管理

---

## 2. 合成仕様

### 2.1 元動画

| 項目 | 値 |
|------|-----|
| 楽曲 | ナナツカゼ「あのね」 |
| 長さ | 15秒 |
| BPM | 128（15秒で32拍） |
| 形式 | グリーンバック動画 |
| 配置 | リポジトリ内（手動DL） |

### 2.2 背景画像切り替えタイミング

- **1拍 = 0.46875秒**（60 / 128）
- 1〜24枚目：1拍ごとに切り替え
- 25枚目：最後の1小節（4拍 = 1.875秒）

```
タイムスタンプ例：
#01: 0.000s
#02: 0.469s
#03: 0.938s
...
#24: 10.781s
#25: 11.250s 〜 終了
```

### 2.3 画像不足時の挙動

- 25枚未満の場合：**ループ再生**
- 例：3枚アップロード → 1,2,3,1,2,3,1,2,3...

### 2.4 合成方法

- FFmpegによるクロマキー合成
- 緑色（グリーンバック）を透過
- 背景画像を動画の後ろに配置

---

## 3. 入力仕様

### 3.1 背景画像

| 項目 | 制限 |
|------|------|
| 枚数 | 最大25枚 |
| 形式 | JPG, PNG |
| サイズ | 1枚あたり最大10MB |
| 順序 | アップロード順 |

### 3.2 ユーザー設定

なし（画像アップロードのみ）

---

## 4. 出力仕様

| 項目 | 値 |
|------|-----|
| 形式 | MP4 |
| 解像度 | 横長（元動画に準拠） |
| 長さ | 15秒（元動画と同じ） |
| 保存期間 | 無期限（初期） |

---

## 5. 技術構成

### 5.1 全体構成

```
[ Browser ]
     |
     |  HTML + JS（操作パネル）
     |
[ Node.js Server (Hono) ]
     |
     |  API / Job管理
     |
[ FFmpeg ]
     |
[ 動画ファイル生成 ]
```

### 5.2 技術スタック

**サーバーサイド**
- Node.js
- TypeScript
- Hono（Webフレームワーク）
- FFmpeg（動画合成）
- Prisma（Job状態管理）
- node-cron（古いJobの掃除）

**フロントエンド**
- 静的HTML
- Vanilla JavaScript
- Tailwind CSS（CDN）
- ビルド時JS難読化

### 5.3 ディレクトリ構成

```
anone-creator/
├─ docs/
│  ├─ SPEC.md              # 本ファイル
│  └─ TODO.md              # 要検討事項
├─ server/
│  ├─ src/
│  │  ├─ index.ts          # Honoエントリポイント
│  │  ├─ routes/
│  │  │  ├─ challenge.ts   # PoWチャレンジ取得
│  │  │  ├─ render.ts      # 合成リクエスト受付
│  │  │  └─ status.ts      # Job状態取得
│  │  ├─ queue/
│  │  │  └─ worker.ts      # FFmpeg実行管理
│  │  └─ ffmpeg/
│  │     └─ composer.ts    # FFmpegコマンド構築
│  ├─ prisma/
│  │  └─ schema.prisma
│  ├─ assets/
│  │  └─ base-video.mp4    # 元動画
│  └─ public/
│     ├─ index.html
│     ├─ app.js            # 難読化対象
│     └─ style.css
├─ build/
│  └─ public/              # 難読化後成果物
├─ output/                 # 生成動画出力先
├─ uploads/                # アップロード画像一時保存
├─ package.json
└─ tsconfig.json
```

---

## 6. API仕様

### 6.1 エンドポイント一覧

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/challenge` | PoWチャレンジ取得 |
| POST | `/api/render` | 合成リクエスト |
| GET | `/api/status/:jobId` | Job状態取得 |
| GET | `/api/download/:jobId` | 動画ダウンロード |

### 6.2 GET /api/challenge

**レスポンス**
```json
{
  "challenge": "ランダム文字列",
  "difficulty": 4,
  "expiresAt": 1234567890
}
```

### 6.3 POST /api/render

**リクエスト**
- Content-Type: `multipart/form-data`
- `images[]`: 画像ファイル（複数）
- `challenge`: チャレンジ文字列
- `nonce`: PoW解答

**レスポンス**
```json
{
  "jobId": "uuid",
  "status": "waiting"
}
```

### 6.4 GET /api/status/:jobId

**レスポンス**
```json
{
  "jobId": "uuid",
  "status": "waiting | running | done | failed",
  "createdAt": "ISO8601",
  "finishedAt": "ISO8601 | null"
}
```

### 6.5 GET /api/download/:jobId

**レスポンス**
- 成功時：動画ファイル（Content-Type: video/mp4）
- 失敗時：404

---

## 7. セキュリティ

### 7.1 設計方針

- 完全防御は狙わない
- 「割に合わない攻撃」だけが残る状態を目標

### 7.2 対策

| 対策 | 説明 |
|------|------|
| Proof of Work | APIリクエストにPoW解答を要求 |
| JS難読化 | フロントエンドJSをビルド時に難読化 |
| 同時実行制限 | FFmpeg同時実行数を制限（1〜2） |
| CORS | 開けない（フロント専用API） |
| 入力制限 | 画像サイズ・枚数を制限 |

### 7.3 PoW仕様

| 項目 | 値 |
|------|-----|
| ハッシュ方式 | SHA-256 |
| 条件 | `hash(challenge + nonce)` の先頭が指定数の `0` |
| difficulty | **4**（初期値、必要に応じて調整） |
| 有効期限 | 60秒 |
| 使用回数 | 1回のみ |

---

## 8. Job管理

### 8.1 Jobステータス

| ステータス | 説明 |
|------------|------|
| waiting | キュー待ち |
| running | FFmpeg実行中 |
| done | 完了 |
| failed | 失敗 |

### 8.2 保存情報

- jobId
- status
- createdAt
- finishedAt
- **processingTimeMs**（FFmpeg処理時間、同時実行数調整のためのデータ収集用）

### 8.3 タイムアウト

- FFmpeg実行：120秒
- 超過時は強制終了し `failed` 扱い

### 8.4 同時実行数

- **初期値：1並列**
- `processingTimeMs` の実データを収集後、必要に応じて調整

---

## 9. デプロイ

### 9.1 環境

| 項目 | 値 |
|------|-----|
| インフラ | VPS |
| OS | Ubuntu |
| CPU | 2コア〜 |
| RAM | 2〜4GB〜 |
| ストレージ | 20GB〜 |

### 9.2 必要ソフトウェア

- Node.js (v20+)
- FFmpeg
- SQLite（Prisma用）

---

## 10. 将来の拡張候補

- 縦長動画対応
- 複数の元動画対応
- 保存期間設定
- 進捗表示（パーセンテージ）
