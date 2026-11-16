> 🌐 [English](../../DESIGN.md) | **Bahasa Indonesia**

# AoKira — Design System & Spesifikasi UI/UX

**Peran Dokumen:** Sumber kebenaran kanonis untuk identitas visual `AoKira`, estetika hibrida 3 lapis, token warna dan tipografi, sistem layout, navigasi, spesifikasi UI/interaksi terperinci untuk kelima halaman, perilaku viewport & kamera 3D, prinsip animasi, responsivitas, aksesibilitas, `prefers-reduced-motion`, dan fallback WebGL.
**Dokumen Kanonis Terkait:** [PRD.md](PRD.md), [SIMULATION_SPEC.md](SIMULATION_SPEC.md), [DATA_MODEL.md](DATA_MODEL.md).

---

## 1. Identitas Visual & Estetika Hibrida

`AoKira` memadukan kejernihan sibernetik presisi bergaya Jepang (`Ao` 蒼 = presisi azure/cyan di atas obsidian) dengan ketelitian otomasi industri melalui tiga lapisan yang disengaja:

1. **Lapisan Sinematik (`Overview`)**: Sel robotik 3D hero dengan pencahayaan studio gelap yang dramatis, highlight rim yang halus, sapuan kamera terkendali, dan showcase produksi beranimasi langsung.
2. **Lapisan Industrial (`Simulation Lab`, `Performance Analytics`, `Optimization Center`)**: Dek kontrol berkepadatan tinggi dan silau rendah, hierarki status yang terstruktur, border yang tegas, dan warna operasional yang tidak ambigu (`Green`, `Amber`, `Red`).
3. **Lapisan Rekayasa (`Digital Twin` & Overlay 3D)**: Grid referensi kelas CAD, triad koordinat XYZ, callout ID komponen, indikator sumbu sendi, jarak rakitan exploded, dan wireframe tabrakan pembatas.

### Prinsip Desain
- **3D Lebih Dulu, HUD Tidak Pernah Menghalangi**: Viewport menguasai panggung utama (`>= 65%` area canvas pada tampilan 3D desktop); panel inspektor menempel rapi di tepi dengan drawer yang dapat dilipat.
- **Tanpa Chrome yang Tidak Perlu**: Setiap animasi, indikator, atau grafik mencerminkan kebenaran simulasi langsung.
- **Tanpa Estetika Termal**: Tidak ada gradien heat-map/pelangi termal; fisika termal berada di luar cakupan.

---

## 2. Palet Warna & Token Material

### 2.1 Sistem Warna UI (Terkunci)

| Nama Token | Hex | Peran & Aturan Penggunaan |
|---|---|---|
| `--bg-canvas` | `#0B0F14` | Latar belakang aplikasi utama & warna clear studio 3D |
| `--bg-surface` | `#141B23` | Sidebar, panel inspektor, kartu analytics (`1px solid #233040`) |
| `--bg-elevated` | `#1C2631` | Bar HUD melayang, dropdown, dialog modal, permukaan hover aktif |
| `--accent-cyan` | `#36C5D9` | Fokus interaktif utama, cincin seleksi aktif, state aktif preset kamera (tanda tangan `Ao`) |
| `--accent-blue` | `#3B82F6` | Telemetri informasional, garis jejak trajektori, seri grafik utama |
| `--status-green` | `#22C55E` | State `RUNNING`, clearance `OK`, selesainya siklus, badge backend sehat |
| `--status-amber` | `#F59E0B` | `PAUSED`, peringatan `NEAR_COLLISION`, banner terdegradasi non-fatal `Backend Unavailable` |
| `--status-red` | `#EF4444` | `FAULT`, `COLLISION`, `UNREACHABLE_TARGET`, `E-STOP` aktif |
| `--text-primary` | `#F1F5F9` | Judul utama, pembacaan KPI, judul komponen (kontras `>= 12:1` pada `#141B23`) |
| `--text-secondary` | `#94A3B8` | Label, satuan, metadata, tick sumbu (kontras `>= 4.8:1` pada `#141B23`) |
| `--border-subtle` | `#243242` | Pembagi panel setipis rambut dan pemisah grid |

### 2.2 Palet Material Robot & Workcell 3D
- **Link Robot Articulated (`link-1`..`link-5`)**: **Industrial Orange** matte/satin (`#EA580C`, roughness `0.42`, metalness `0.20`).
- **Rumah Sendi, Pedestal & Base (`link-0`, `link-6`)**: **Anodized Graphite** gelap (`#1E242B`, roughness `0.55`, metalness `0.65`).
- **Rahang Gripper, Rel Linear & Clamp Fixture**: **Metallic Gray / Steel** tergosok (`#94A3B8`, roughness `0.28`, metalness `0.85`).
- **Sabuk Konveyor**: Elastomer bertekstur gelap (`#181C22`) dengan strip chevron/tick bergerak halus yang digerakkan oleh kecepatan belt.
- **Workpiece (`60 x 60 x 60 mm`)**: Billet aluminium tergosok (`#CBD5E1`) yang berubah halus saat state genggam/terproses dengan penanda status cyan (`#36C5D9`) yang terukir laser setelah `PROCESS_WORKPIECE`.
- **Override Sorotan Tabrakan & Seleksi**:
  - Komponen terpilih: rim tepi wireframe/emissive `#36C5D9`.
  - Volume near-collision: `#F59E0B` translusen (`opacity: 0.35`).
  - Volume tabrakan aktif: `#EF4444` translusen (`opacity: 0.55`) + outline peringatan merah solid.

---

## 3. Tipografi & Skala Spasi

| Peran | Font Stack | Bobot & Fitur |
|---|---|---|
| **Display & Judul** | `'Space Grotesk', system-ui, sans-serif` | `600`–`700`, tracking rapat (`-0.02em`) |
| **Isi UI & Kontrol** | `'Inter', system-ui, sans-serif` | `400`–`500`, keterbacaan standar |
| **Telemetri & Pembacaan Numerik** | `'JetBrains Mono', ui-monospace, monospace` | `font-variant-numeric: tabular-nums` wajib pada semua sudut sendi langsung, timer, KPI, dan koordinat |
| **Label Rekayasa 3D** | Pill mono/sans huruf kapital ringkas `11px`–`12px` | Latar `#0B0F14/85` berkontras tinggi dengan border `1px solid #36C5D9/40` |

**Spasi & Radius**: Unit dasar `4px` (`4 / 8 / 12 / 16 / 24 / 32px`). Sudut industrial yang tegas: `4px` (`rounded`) untuk input/badge, `8px` (`rounded-lg`) untuk panel/kartu, `9999px` untuk status pill.

---

## 4. Navigasi & Shell Aplikasi

Header persisten di atas (tinggi `56px` di desktop) yang menampilkan:
- **Kiri**: Wordmark `AoKira` + glyph twin geometris yang halus + pill `"SIMULATION ONLY"`.
- **Navigasi Tengah (5 Rute)**:
  1. `01 Overview` (`/`)
  2. `02 Digital Twin` (`/digital-twin`)
  3. `03 Simulation Lab` (`/simulation`)
  4. `04 Performance Analytics` (`/analytics`)
  5. `05 Optimization Center` (`/optimization`)
- **Klaster Pill Sistem Kanan**:
  - Titik status Worker Rust/WASM (`READY` / `RUNNING` / `FAULT`)
  - Badge kesehatan API Python (`API Online` / `API Offline`)

---

## 5. Struktur Halaman demi Halaman & Perilaku Interaksi

### 5.1 `01. Overview` (`/`)
- **Layout**: Viewport 3D hero full-bleed (`min-height: calc(100vh - 56px)`) dengan kartu intro editorial/teknis melayang di kiri dan strip telemetri workcell langsung melayang di bawah.
- **Konten**:
  - Judul merek **`AoKira`** + subjudul *"Industrial Robotic Workcell Digital Twin"* + tagline *"Design. Simulate. Optimize. Operate."*
  - Siklus manufaktur beranimasi langsung yang dieksekusi lewat Worker Rust/WASM (loop showcase `Scenario A: Baseline`) sehingga metrik showcase yang ditampilkan murni berasal dari tick simulasi asli, bukan angka palsu.
  - Strip status sistem (Engine `Rust/WASM 20ms`, DOF `6-Axis`, status Backend).
  - Penghitung snapshot langsung (`Completed Units`, `Active Stage`, `Avg Cycle Time` — tersinkron dengan state engine).
  - CTA utama: **`Open Digital Twin`** (`/digital-twin`) dan **`Launch Simulation Lab`** (`/simulation`).
- **Interaksi**: Parallax hover pointer atau orbit seret tersedia dengan lembut; auto-orbit langsung berhenti saat pengguna berinteraksi.

### 5.2 `02. Digital Twin` (`/digital-twin`)
- **Layout**: Workbench CAD 3D layar penuh dengan:
  - **Dock Kiri (`280px`)**: Component Tree (seluruh 10 komponen kanonis) dengan toggle mata visibilitas, toggle Isolate, tombol Reset Workcell, dan View Overlays (`Grid & Axes`, `Labels & Sensors`, `Collision Geometry`, slider `Exploded View` `0%–100%`).
  - **Tengah (`flex-1`)**: Viewport 3D + toolbar Preset Kamera di tengah atas (`Front`, `Side`, `Top`, `Isometric`, `Reset Camera`).
  - **Dock Kanan (`320px`)**: **Panel Informasi Komponen** yang peka konteks:
    - Menampilkan nama, `ComponentId`, kategori, dimensi fisik, koordinat dunia, dan status langsung.
    - **Ketika `robot-arm` dipilih (`AC-04`)**: Menampilkan **6-Joint Inspector** interaktif yang mencantumkan `J1` hingga `J6` secara terpisah, masing-masing dengan sudut saat ini (`deg`), bar batas sudut min/maks, spesifikasi kecepatan/akselerasi maksimum, dan slider jog interaktif (aktif saat simulasi idle/berhenti, nonaktif dengan tooltip selama siklus aktif) ditambah input cepat **Cartesian TCP Target Test** yang memanggil `SOLVE_IK`.

### 5.3 `03. Simulation Lab` (`/simulation`)
- **Layout**:
  - **Dek Kontrol Atas/Kiri (`340px`)**:
    - Bar Transport: `Start`, `Pause` / `Resume`, `Stop`, `Reset`, ditambah pemicu `E-Stop`.
    - Mode & Parameter: `Single Cycle` vs `Continuous` vs `Fixed Quantity` (input `targetQuantity`), `Simulation Speed` (`0.25x`–`4.0x`), `Robot Motion Speed` (`20%`–`150%`), `Input/Output Conveyor Speed` (`0.05`–`0.60 m/s`), `Processing Dwell` (`ms`), dan tombol uji manual `Gripper Open/Close`.
  - **Tengah**: Viewport Workcell 3D langsung yang menampilkan jejak trajektori real-time, sinar sensor aktif, perjalanan workpiece, dan mesh peringatan/fault tabrakan.
  - **Panel Telemetri Bawah / Kanan (`340px`)**:
    - **Stepper Pipeline Proses 8 Stage** yang menyorot stage saat ini (`DETECT_OBJECT` ... `CYCLE_COMPLETE` atau `FAULT`).
    - **Banner Fault** ketika `activeFault != null` yang menampilkan kode fault, komponen penyebab, dan CTA pemulihan `Reset`.
    - **Live Event Log** yang mengalirkan baris `SimulationEvent` bertimestamp (`seq`, `simTimeMs`, `severity`, `stage`, `message`) dengan filter severity (`ALL`, `WARN/ERR`).

### 5.4 `04. Performance Analytics` (`/analytics`)
- **Layout**: Grid dasbor industrial responsif yang diisi secara ketat dari `SimulationEvent[]` dan `ProductionMetrics` (`AC-12`):
  - **State Tanpa Data**: Jika belum ada tick/event simulasi, menampilkan kartu status kosong yang eksplisit yang mengajak pengguna menjalankan siklus di `Simulation Lab` (tidak pernah KPI statis palsu).
  - **Grid KPI (10 Metrik Inti)**: Total Units Produced, Units/Hour, Average Cycle Time, Robot Utilization %, Conveyor Utilization %, Idle Time, Downtime, Collision Events, Estimated Energy (`Wh` + disclaimer sintetis), Production Efficiency %.
  - **Grafik (Recharts)**:
    1. Grafik Batang Bertumpuk Rincian Per-Siklus (`robotMoveMs` vs `processDwellMs` vs `waitTimeMs`).
    2. Grafik Garis Tren Throughput & Energi per Unit lintas siklus.
    3. Donut/Bar Alokasi Waktu (`Active`, `Processing Wait`, `Idle`, `Downtime`).
  - **Bagian Pengayaan Backend**: Kartu Diagnostik Bottleneck, Proyeksi Deterministik 8 Jam, Rincian Sub-Komponen Energi, dan badge Pemeriksaan Konsistensi Client–Server — menampilkan kartu `Backend Unavailable` yang bersih dengan aksi retry ketika `/api/v1` offline (`AC-15`).

### 5.5 `05. Optimization Center` (`/optimization`)
- **Layout**: Workbench terbagi:
  - **Panel Konfigurasi & Kendala Kiri (`360px`)**:
    - Pemuat preset (`Scenario A: Baseline`, `Scenario B: Faster Robot Motion`, `Scenario C: Optimized Trajectory`, `Scenario D: Adjusted Conveyor Speed`) + editor skenario kustom.
    - Pemilih Objektif Optimasi (`Min Cycle Time`, `Min Energy/Unit`, `Balanced`) dan batas kendala (`minThroughputUnitsPerHour`, nol tabrakan terkunci).
    - Tombol aksi: **`Compare Scenarios`** (`/scenarios/compare`) dan **`Run Optimization`** (`/optimization/run`).
  - **Kanvas Perbandingan & Rekomendasi Kanan (`flex-1`)**:
    - Tabel Perbandingan Skenario berdampingan (Cycle Time, Throughput, Idle %, Estimasi Energi, Tabrakan, Bottleneck, Peringkat).
    - Grafik Perbandingan Multi-Skenario (scatter/bar Throughput vs Energi).
    - **Kartu Konfigurasi yang Direkomendasikan** yang menampilkan delta persentase terhadap Baseline dan tombol **`Load into Simulation Lab`** yang menerapkan `recommendedScenario` langsung ke worker Rust/WASM.
    - Ketika backend offline, menampilkan banner status `Optimization Service Unavailable` yang eksplisit tanpa memblokir pembuatan skenario atau simulasi skenario tunggal lokal.

---

## 6. Spesifikasi Viewport & Kamera 3D

| Preset Kamera | Posisi (`WorldFrame`, `m`) | Target LookAt (`m`) | Tujuan |
|---|---|---|---|
| `Isometric` (Default) | `(2.05, 1.65, 2.20)` | `(0.00, 0.72, -0.05)` | Tampilan 3/4 workcell penuh yang menunjukkan input, station, output, pagar, E-stop |
| `Front` | `(0.00, 1.05, 2.65)` | `(0.00, 0.75, 0.00)` | Tampilan depan lengan robot & konveyor tanpa halangan |
| `Side` | `(2.65, 1.05, 0.05)` | `(0.00, 0.75, -0.10)` | Tampilan profil jangkauan lengan & stasiun pemrosesan belakang |
| `Top` | `(0.00, 3.30, 0.01)` | `(0.00, 0.00, -0.05)` | Layout CAD denah yang menunjukkan `Input (-X)` -> `Station (-Z)` -> `Output (+X)` |

- **Batas OrbitControls**: Sudut polar `minPolarAngle = 0.05 rad`, `maxPolarAngle = Math.PI / 2 - 0.03` (mencegah masuk ke bawah lantai), `minDistance = 0.80 m`, `maxDistance = 6.50 m`, damping aktif (`dampingFactor = 0.08`).

---

## 7. Animasi, Responsivitas, Aksesibilitas & Fallback

### 7.1 Aturan Animasi
- **Overview**: Drift kamera sinusoidal/orbital yang lambat (`<= 0.06 rad/s`), langsung berhenti saat drag/wheel/fokus.
- **Digital Twin**: Interpolasi teredam yang halus (ease-out `300 ms`) saat berpindah antar preset kamera; transisi terpandu `250 ms` yang halus pada pembaruan slider Exploded View.
- **Simulation Lab**: Murni digerakkan engine pada langkah tetap `20 ms`; tidak ada penghalusan CSS/spring buatan yang menutupi timing sendi atau tabrakan yang sebenarnya.

### 7.2 Breakpoint Responsif (`AC-16`)
- **Desktop (`>= 1280px`)**: Sidebar persisten penuh + canvas 3D tengah `65%+` + grid analytics multi-kolom.
- **Tablet (`768px`–`1279px`)**: Drawer slide-over kiri/kanan yang dapat dilipat di atas canvas 3D lebar `100%`; grid analytics 2 kolom.
- **Mobile (`< 768px`)**: Layout bertumpuk dengan canvas 3D tetap `42vh` di atas sheet kontrol/inspektor bertab yang dapat di-scroll dan kartu KPI satu kolom; drawer navigasi hamburger.

### 7.3 Aksesibilitas & Reduced Motion (`AC-17`)
- Pintasan keyboard (saat canvas/aplikasi fokus, bukan input): `1`–`4` preset kamera, `Space` Start/Pause, `R` Reset kamera/tampilan (didokumentasikan secara eksplisit di tooltip UI).
- Landmark semantik (`<header>`, `<nav>`, `<main>`), `aria-live="polite"` untuk pembaruan stage produksi, `aria-live="assertive"` untuk peringatan `FAULT` / `COLLISION`.
- **`prefers-reduced-motion: reduce`**:
  - Menonaktifkan orbit kamera otomatis `Overview`.
  - Transisi preset kamera dan offset slider exploded view langsung snap (transisi `0 ms`).
  - Animasi CSS sensor/beacon yang berdenyut dirender sebagai indikator solid yang stabil.

### 7.4 Context Loss WebGL & Fallback (`AC-17`)
- Sebelum memasang `<Canvas>` Three.js dan saat `webglcontextlost`:
  - Periksa kapabilitas WebGL2/WebGL1 dengan bersih.
  - Jika tidak didukung atau context hilang tanpa bisa dipulihkan, render **`WebGLFallbackView`**: skema rekayasa SVG 2D yang bersih dan interaktif (`Top Plan` + `Front Elevation`) yang dianimasikan langsung dari koordinat `SimulationSnapshot` (`linkWorldPoses`, sabuk konveyor, posisi workpiece, indikator sorotan tabrakan), sehingga 100% kontrol sendi, kontrol simulasi, log event, analytics, dan optimasi tetap dapat digunakan.
