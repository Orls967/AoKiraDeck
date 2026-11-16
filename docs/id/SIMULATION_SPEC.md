> 🌐 [English](../../SIMULATION_SPEC.md) | **Bahasa Indonesia**

# AoKira — Spesifikasi Simulasi

**Peran Dokumen:** Sumber kebenaran kanonis untuk sistem koordinat, geometri fisik workcell, kinematika manipulator 6 sumbu (parameter DH & FK/IK), interpolasi trajektori, deteksi tabrakan, mekanika workpiece/gripper/konveyor/stasiun, state machine produksi 8 stage, jam langkah-tetap deterministik, estimasi energi, dan batas simulasi.
**Tipe Entitas yang Dirujuk:** Didefinisikan di [DATA_MODEL.md](DATA_MODEL.md).

---

## 1. Sistem Koordinat & Layout Workcell

### 1.1 Frame Kanonis
1. **World Frame (`WorldFrame`)**:
   - Frame Cartesian tangan-kanan **Y-Up** (`+X` aliran produksi kiri ke kanan, `+Y` vertikal ke atas, `+Z` mengarah ke penonton di depan), dalam **meter (`m`)**.
   - Origin `(0.000, 0.000, 0.000)` berada di lantai workcell tepat di bawah pusat pedestal robot.
   - Three.js / React Three Fiber mengonsumsi pose `WorldFrame` secara langsung tanpa penukaran sumbu.
2. **Robot Base Frame (`BaseFrame`)**:
   - Konvensi robotika tangan-kanan **Z-Up** (`+X_b` maju menuju Processing Station `-Z_w`, `+Y_b` ke kiri menuju Input Conveyor `-X_w`, `+Z_b` vertikal ke atas `+Y_w`).
   - Origin berada di flange pemasangan atas pedestal robot: `WorldFrame` `(0.000, 0.450, 0.000)`.
   - Transform rigid yang tepat $T_{\text{world}\leftarrow\text{base}}$:
     $$R_{\text{world}\leftarrow\text{base}} = \begin{bmatrix} 0 & -1 & 0 \\ 0 & 0 & 1 \\ -1 & 0 & 0 \end{bmatrix}, \quad q_{\text{world}\leftarrow\text{base}} = (-0.5,\; +0.5,\; +0.5,\; +0.5), \quad p_{\text{base}} = \begin{bmatrix} 0.000 \\ 0.450 \\ 0.000 \end{bmatrix}\text{ m}$$
   - Tujuan penyelarasan ini: `q1 = 0` mengarah langsung ke Processing Station (`-Z_w`), `q1 ≈ +98.13°` mengarah ke Input Pick (`-X_w`), dan `q1 ≈ -98.13°` mengarah ke Output Place (`+X_w`). Total sapuan basis operasional tetap di dalam `[-105°, +105°]`, menyisakan margin lebih dari `65°` dari batas `±170°` dan menghindari diskontinuitas wrap-around `±180°`.

### 1.2 Koordinat Komponen Workcell Terkunci (`WorldFrame`)

| ID Komponen | Posisi / Batas (`m`) | Elevasi / Target Utama (`m`) | Catatan |
|---|---|---|---|
| `robot-pedestal` | Pusat `(0.000, 0.225, 0.000)`, radius silinder `0.220`, tinggi `0.450` | Flange atas `y = 0.450` | Silinder bevel visual; tabrakan memakai `BoxVolume` (`halfExtents: [0.220, 0.225, 0.220]`). |
| `input-conveyor` | `x ∈ [-1.460, -0.460]`, `z ∈ [-0.040, +0.200]`, kotak belt `y ∈ [0.620, 0.720]` | Atas belt `y = 0.720`; Spawn `(-1.380, 0.750, +0.080)`; Pick `(-0.560, 0.750, +0.080)` | Mengalir sepanjang `+X_w`. |
| `output-conveyor` | `x ∈ [+0.460, +1.460]`, `z ∈ [-0.040, +0.200]`, kotak belt `y ∈ [0.620, 0.720]` | Atas belt `y = 0.720`; Place `(+0.560, 0.750, +0.080)`; Despawn `x >= +1.400` | Mengalir sepanjang `+X_w`. |
| `processing-station` | `x ∈ [-0.200, +0.200]`, `z ∈ [-0.740, -0.380]`, meja `y ∈ [0.000, 0.720]` | Atas fixture `y = 0.720`; Pusat workpiece `(0.000, 0.750, -0.560)` | Kepala scanner belakang berada di `z = -0.710, y = 0.880` (`150 mm` di belakang TCP) dengan rahang clamp samping sepanjang `±Z` yang membuka hingga `±0.065` agar robot dapat masuk vertikal tanpa halangan. |
| `workpiece` | Kubus `0.060 x 0.060 x 0.060`, massa default `1.20 kg` (batas `5.0 kg`) | Pusat saat diam `+0.030` di atas belt/fixture (`y = 0.750`) | Kuboid rigid sintetis. |
| `safety-fence` | Dinding perimeter di `x = ±1.600`, `z = ±1.200`, tinggi `1.450` | Potongan lintasan konveyor di `z ∈ [-0.180, +0.180]`, `y ∈ [0.720, 1.070]` | Dimodelkan sebagai segmen dinding `BoxVolume` terpisah yang menyisakan lintasan konveyor tanpa halangan. |
| `estop-station` | Di luar pagar pada `(+1.720, 0.525, +1.050)` | Tinggi `1.050` | Pemicu emergency stop yang dapat dipilih & interaktif. |
| `sensor-array` | Input `(-0.560, 0.750, +0.210)`, Station `(0.000, 0.750, -0.440)`, Output `(+0.560, 0.750, +0.210)`, Beacon `(+1.540, 1.520, -1.140)` | — | Sinar optik visual & menara status RGBY. |

---

## 2. Konfigurasi Robot 6 Sumbu & Kinematika

### 2.1 Tabel Denavit-Hartenberg (DH) Standar (`BaseFrame`)
Menggunakan konvensi Standard DH:
$$T_i(q_i) = R_z(\theta_i)\, T_z(d_i)\, T_x(a_i)\, R_x(\alpha_i)$$

| Sendi | Nama | $\theta_i$ (`rad`) | $d_i$ (`m`) | $a_i$ (`m`) | $\alpha_i$ (`rad`) | Min (`deg`) | Maks (`deg`) | $v_{\max}$ (`deg/s`) | $a_{\max}$ (`deg/s^2`) | Home (`deg`) | Torsi Terukur (`Nm`) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `J1` | Base Yaw | $q_1$ | `0.340` | `0.080` | $-\pi/2$ | `-170` | `+170` | `180` | `450` | `0` | `120` |
| `J2` | Shoulder Pitch | $q_2 - \pi/2$ | `0.000` | `0.420` | `0` | `-95` | `+120` | `150` | `360` | `10` | `140` |
| `J3` | Elbow Pitch | $q_3$ | `0.000` | `0.050` | $-\pi/2$ | `-120` | `+135` | `180` | `450` | `20` | `90` |
| `J4` | Forearm Roll | $q_4$ | `0.400` | `0.000` | $+\pi/2$ | `-180` | `+180` | `240` | `600` | `0` | `45` |
| `J5` | Wrist Pitch | $q_5$ | `0.000` | `0.000` | $-\pi/2$ | `-125` | `+125` | `240` | `600` | `60` | `35` |
| `J6` | Tool Flange Roll | $q_6$ | `0.100` | `0.000` | `0` | `-360` | `+360` | `360` | `900` | `0` | `25` |

- **Transform TCP Gripper Tetap (`Flange -> TCP`)**: $T_{\text{tcp}} = T_z(+0.120\text{ m})$ sepanjang Frame 6 `+Z_6`.
- **Properti Verifikasi**: Pada `Home = [0°, 10°, 20°, 0°, 60°, 0°]`, $q_2 + q_3 + q_5 = 90^\circ$, yang mengarahkan sumbu pendekatan tool gripper (`+Z_6`) lurus ke bawah (`-Z_b` / `-Y_w`) menjauhi singularitas pergelangan ($q_5 \neq 0$).

### 2.2 Forward Kinematics (FK)
- Diberikan vektor sendi $q = [q_1, \dots, q_6]^T \in \mathbb{R}^6$:
  - Hitung transform kumulatif $T_0^k(q) = \prod_{i=1}^{k} T_i(q_i)$ untuk $k = 1 \dots 6$.
  - Hitung transform TCP di `BaseFrame`: $T_0^{\text{tcp}}(q) = T_0^6(q) \cdot T_z(0.120)$.
  - Transformasikan semua frame ke `WorldFrame` lewat $T_{\text{world}}^k(q) = T_{\text{world}\leftarrow\text{base}} \cdot T_0^k(q)$.
- Baik Rust/WASM (`crates/aokira-engine`) maupun hierarki sendi visual Three.js memakai rantai frame DH yang persis sama (`linkWorldPoses` dari `SimulationSnapshot` langsung menggerakkan transform link robot yang dirender, menjamin paritas visual-kinematik `AC-05`).

### 2.3 Inverse Kinematics (IK)
- **Algoritma Solver**: **Damped Least Squares (Levenberg-Marquardt)** iteratif di `BaseFrame` menggunakan Jacobian geometris `6 x 6` $J(q)$:
  - Kolom linear: $J_{v,i} = z_{i-1} \times (p_{\text{tcp}} - p_{i-1})$
  - Kolom angular: $J_{\omega,i} = z_{i-1}$
- **Metrik Error**:
  - Error posisi: $e_p = p_{\text{target}} - p_{\text{tcp}}(q)$
  - Error orientasi: $e_r = \text{axis\_angle}(R_{\text{target}} \cdot R_{\text{tcp}}(q)^T)$
  - Error 6D gabungan: $e = [e_p;\; e_r]$
- **Hukum Pembaruan**:
  $$\Delta q = J^T (J J^T + \lambda^2 I_6)^{-1} e$$
  - Damping dasar $\lambda_0 = 0.025$; damping adaptif menskalakan $\lambda \leftarrow \min(2\lambda, 0.25)$ ketika residual tidak menurun dan mengecil $\lambda \leftarrow \max(0.7\lambda, 0.01)$ ketika ada perbaikan.
  - Langkah sendi per iterasi dibatasi pada `max_step = 0.25 rad`.
  - Batas sendi di-clamp setelah setiap langkah: $q_i \leftarrow \text{clamp}(q_i, q_{i,\min}, q_{i,\max})$.
- **Strategi Multi-Seed**:
  1. Seed 0: konfigurasi robot saat ini `q_current`.
  2. Seed 1: pose `Home` `[0°, 10°, 20°, 0°, 60°, 0°]`.
  3. Seed 2: seed selaras azimut `[atan2(y_b, x_b), 0.35, 0.45, 0.0, 0.77, 0.0]`.
- **Aturan Konvergensi & Kegagalan**:
  - Iterasi maksimum per seed: `120`.
  - Toleransi konvergensi: $\|e_p\|_2 \le 0.0005\text{ m}$ (`0.5 mm`) dan $\|e_r\|_2 \le 0.005\text{ rad}$ (`~0.29°`).
  - Jika semua seed gagal memenuhi toleransi atau target berada di luar envelope fisik / menabrak batas sendi yang tak terselesaikan, kembalikan error terstruktur `UNREACHABLE_TARGET` atau `JOINT_LIMIT_VIOLATION` tanpa memodifikasi state robot yang sedang berjalan (`AC-07`).

---

## 3. Perencanaan Gerak & Interpolasi Trajektori

### 3.1 Filosofi Waypoint & Pendekatan
Transfer pick, place, dan stasiun tidak pernah memerintahkan sapuan diagonal langsung melintasi rintangan. Setiap interaksi stasiun memakai waypoint hover vertikal yang aman (`+0.140 m` di atas pusat target) dengan rahang gripper selaras membuka sepanjang `Y_6` (`+X_w` pada `q1 = 0°`, tegak lurus terhadap clamp samping `±Z_w` Processing Station) dan pendekatan tool `+Z_6` mengarah vertikal ke bawah (`-Y_w` di `WorldFrame`, setara orientasi `Home` `R_tcp`):
- **Input Hover**: `(-0.560, 0.890, +0.080)` -> **Input Pick**: `(-0.560, 0.750, +0.080)`
- **Station Hover**: `(0.000, 0.890, -0.560)` -> **Station Place/Pick**: `(0.000, 0.750, -0.560)`
- **Output Hover**: `(+0.560, 0.890, +0.080)` -> **Output Place**: `(+0.560, 0.750, +0.080)`

### 3.2 Trajektori Ruang Sendi Polinomial Quintic
Untuk segmen dari $q_{\text{start}}$ ke $q_{\text{end}}$ dengan kecepatan dan akselerasi batas nol:
$$s(\tau) = 10\tau^3 - 15\tau^4 + 6\tau^5, \quad \tau = \frac{t}{T} \in [0, 1]$$
$$q(t) = q_{\text{start}} + (q_{\text{end}} - q_{\text{start}})\, s(\tau)$$
$$\dot{q}(t) = \frac{q_{\text{end}} - q_{\text{start}}}{T}\,(30\tau^2 - 60\tau^3 + 30\tau^4)$$
$$\ddot{q}(t) = \frac{q_{\text{end}} - q_{\text{start}}}{T^2}\,(60\tau - 180\tau^2 + 120\tau^3)$$

### 3.3 Durasi Segmen $T$ yang Patuh Kendala
Diberikan batas efektif yang diskalakan oleh parameter skenario (`v_eff = v_max * robotSpeedScale`, `a_eff = a_max * robotAccelScale`):
- Faktor kecepatan puncak quintic adalah `1.875` pada $\tau = 0.5$.
- Faktor akselerasi puncak quintic adalah `10 / sqrt(3) ≈ 5.7735` pada $\tau = 0.5 \mp 1/\sqrt{12}$.
- Durasi valid minimum di seluruh 6 sendi:
  $$T_{\min} = \max_{i=1..6} \left( \frac{1.875\,|\Delta q_i|}{v_{\text{eff},i}},\; \sqrt{\frac{5.7735\,|\Delta q_i|}{a_{\text{eff},i}}} \right)$$
- Durasi segmen $T$ dibulatkan ke atas menjadi kelipatan `timestepMs` (`20 ms`) dengan minimum `100 ms` untuk gerak tidak nol (`AC-08`).
- Perencanaan trajektori berjalan **sebelum** eksekusi segmen: setiap titik sampel `20 ms` sepanjang trajektori yang direncanakan diperiksa lebih dulu terhadap batas sendi (dan opsional dipratinjau untuk tabrakan); pemeriksaan tabrakan runtime juga dieksekusi pada setiap tick `20 ms`.

---

## 4. Deteksi Tabrakan & Clearance

### 4.1 Primitif Geometri Tabrakan
- **Link Robot (`link-1`..`link-6`) & Gripper**: Dimodelkan sebagai **Capsule** pembatas (`segment [localStart, localEnd]` + `radius`), ditransformasikan ke `WorldFrame` lewat pose link FK saat ini:
  - `link-1` (turret bahu): radius `0.095 m`
  - `link-2` (lengan atas): radius `0.070 m`
  - `link-3` (siku): radius `0.065 m`
  - `link-4` (lengan bawah): radius `0.055 m`
  - `link-5` (pergelangan): radius `0.045 m`
  - `gripper` (badan + envelope rahang): radius `0.055 m`
- **Workpiece yang Dipegang**: Dimodelkan sebagai bola/kotak pembatas berorientasi (`halfExtents = [0.030, 0.030, 0.030] m`) yang menempel pada TCP selama `heldWorkpieceId != null`.
- **Lingkungan Statis**: Kotak Pembatas Berorientasi/Sejajar Sumbu (`BoxVolume`) untuk `robot-pedestal`, `input-conveyor`, `output-conveyor`, `processing-station`, dinding `safety-fence`, dan `estop-station`.

### 4.2 Jarak Berpasangan & Klasifikasi
- Pasangan link kinematik yang bersebelahan (`(i, i+1)`) dan pasangan kontak yang disengaja (misalnya `gripper` + `heldWorkpieceId`, atau workpiece yang diam + bagian atas konveyor/fixture penopang) dikecualikan dari peringatan tabrakan false-positive saat menggenggam/diam.
- Untuk semua pasangan yang diperiksa $(A, B)$, hitung clearance permukaan minimum yang tepat $d_{\text{clear}}$:
  - $d_{\text{clear}} \le 0.000\text{ m}$ -> **`COLLISION`** (`severity = 'COLLISION'`).
  - $0.000\text{ m} < d_{\text{clear}} \le 0.025\text{ m}$ (`25 mm`) -> **`NEAR_COLLISION`** (`severity = 'NEAR_COLLISION'`).
  - $d_{\text{clear}} > 0.025\text{ m}$ -> **`NONE`**.
- **Konsekuensi**:
  - `NEAR_COLLISION`: Mencatat event `NEAR_COLLISION_WARNING` (di-debounce per episode pendekatan yang berkelanjutan) dan menyorot pasangan yang terpengaruh dengan Amber (`#F59E0B`).
  - `COLLISION`: Segera menghentikan gerak, memancarkan `COLLISION_DETECTED`, mengalihkan state machine ke `FAULT` (`FaultCode::COLLISION`), menyorot pasangan dengan Merah (`#EF4444`), dan menunggu `Reset` (`AC-09`).

---

## 5. Subsistem: Gripper, Konveyor, Stasiun Pemrosesan & Workpiece

### 5.1 Gripper Paralel Dua Jari
- Bukaan rahang mencakup `[0.000 m, 0.080 m]`.
- Transisi (`OPEN -> CLOSING -> CLOSED` dan `CLOSED -> OPENING -> OPEN`) dieksekusi dengan mulus selama `actuationTimeMs = 300 ms` (`15` tick simulasi).
- **Prasyarat Genggam**: Pusat workpiece harus berada dalam `0.015 m` dari `tcpWorldPose` dan massa workpiece harus memenuhi `massKg <= payloadLimitKg (5.0 kg)`. Kegagalan memicu `GRIPPER_FAILURE` atau `PAYLOAD_EXCEEDED`.
- Saat tergenggam, `poseWorld` workpiece terkunci secara deterministik pada `tcpWorldPose`.

### 5.2 Konveyor Input & Output
- Konveyor input memunculkan workpiece sintetis `60 x 60 x 60 mm` di `(-1.380, 0.750, +0.080)` setiap kali pintu masuk belt kosong (jarak `>= 0.220 m`) dan sisa unit target mengizinkan.
- Pada setiap tick $\Delta t = 0.020\text{ s}$, workpiece yang tidak tergenggam di atas belt yang berjalan maju sepanjang `+X_w` sejauh `v_belt * 0.020 m`.
- **Berhenti di Zona Input**: Ketika workpiece mencapai `x >= -0.560`, `sensor-input` terpicu, belt input berhenti untuk workpiece terdepan itu (menahannya dengan rapi di zona pick `(-0.560, 0.750, +0.080)`), dan state beralih `DETECT_OBJECT -> APPROACH_PICK`.
- **Interlock Belt PLC**: Belt input menahan selama gripper menjepit dan mengangkat bagian dari zona pick (aktuasi/retraksi `PICK_WORKPIECE`), dan belt output menahan selama gripper melepas dan menarik diri di zona drop (aktuasi/retraksi `PLACE_WORKPIECE`). Tanpa interlock input, belt cepat (`>= ~0.45 m/s`) mendorong bagian berikutnya ke bagian yang sedang diangkat. `RUST-PROD-07` memverifikasi bahwa setiap sudut kotak parameter yang diizinkan (kecepatan/akselerasi robot `0.20`/`1.50`, belt input dan output `0.05`/`0.60 m/s`, dwell `500`/`10000 ms`) selesai tanpa fault tabrakan.
- **Keluar Belt Output**: Workpiece yang ditempatkan di `(+0.560, 0.750, +0.080)` bergerak sepanjang `+X_w` hingga `x >= +1.400`, memicu `sensor-output`, menaikkan hitungan keluar output yang selesai, dan dipensiunkan dari mesh scene aktif.

### 5.3 Stasiun Pemrosesan
- Menerima workpiece mentah di `(0.000, 0.750, -0.560)`.
- Setelah robot melepas workpiece dan menjauh dari `Station Hover`, clamp samping menutup (`clampEngaged = true`) dan dwell pemrosesan menghitung mundur secara deterministik selama `processingDwellMs` (default `2500 ms`).
- Pada progres `100%`, clamp dilepas dan workpiece beralih `PROCESSING -> PROCESSED_READY`.

---

## 6. State Machine Produksi (Siklus 8 Stage)

```
IDLE
  │ (perintah Start)
  ▼
DETECT_OBJECT ──(timeout objek / fault uji objek hilang)──► FAULT
  │ (sensor input terpicu)
  ▼
APPROACH_PICK (Home/Saat Ini -> Input Hover -> Input Pick)
  │
  ▼
PICK_WORKPIECE (Gripper menutup 300 ms, menempelkan workpiece)
  │ (fault gripper / fault payload) ──────────────────► FAULT
  ▼
TRANSFER_TO_STATION (Input Hover -> Station Hover -> Station Place)
  │
  ▼
PROCESS_WORKPIECE (Lepas, tarik ke Station Hover, dwell 2500 ms)
  │
  ▼
PICK_FINISHED (Station Hover -> Station Pick -> Tutup Gripper 300 ms)
  │
  ▼
TRANSFER_TO_OUTPUT (Station Hover -> Output Hover -> Output Place)
  │
  ▼
PLACE_WORKPIECE (Lepas workpiece di belt output, tarik ke Output Hover)
  │
  ▼
CYCLE_COMPLETE (Pancarkan CYCLE_COMPLETED, naikkan completedUnits)
  ├──(Continuous atau completedUnits < targetUnits)──► DETECT_OBJECT
  └──(Single atau target tercapai)───────────────────► IDLE / COMPLETED

(Stage aktif mana pun: COLLISION / UNREACHABLE_TARGET / JOINT_LIMIT / ESTOP_ACTIVE ──► FAULT)
(FAULT ──(perintah Reset)──► IDLE)
```

Setiap transisi memancarkan `SimulationEvent` dengan `STAGE_ENTERED` (dan `CYCLE_STARTED` / `CYCLE_COMPLETED` bila berlaku).

---

## 7. Jam Simulasi, Determinisme & Model Energi

### 7.1 Jam Langkah-Tetap Deterministik
- Langkah waktu kanonis: **`timestepMs = 20`** (laju simulasi deterministik `50 Hz`).
- `requestAnimationFrame` browser mengakumulasi waktu dinding yang berlalu dikalikan `playbackSpeedMultiplier` (`0.25x` sampai `4.0x`), dibatasi `200 ms` per frame untuk mencegah lag spiral-of-death, dan memanggil tick tetap `step(20)` di Web Worker Rust/WASM.
- **Invarian Determinisme**: `WorkcellConfig` + `ScenarioConfig` yang identik (termasuk `seed`) menghasilkan lintasan `SimulationSnapshot`, `simTimeMs`, `SimulationEvent[]`, dan KPI yang identik bit demi bit, terlepas dari refresh rate layar (`AC-12`).

### 7.2 Estimasi Konsumsi Energi Sintetis
Dihitung per tick `20 ms` (`dt = 0.020 s`) sebagai **estimasi demonstrator rekayasa** (bukan pengukuran listrik fisik):
$$P_{\text{total}}(t) = P_{\text{idle}} + \sum_{i=1}^{6} \left( k_{\text{vel},i}|\dot{q}_i(t)| + k_{\text{acc},i}|\ddot{q}_i(t)| + k_{\text{res},i}\,\ddot{q}_i(t)^2 \right) + P_{\text{payload}}(m_{\text{held}}, \dot{q}) + P_{\text{aux}}(t)$$
- $P_{\text{idle}} = 120\text{ W}$ (kontroler + servo standby + sensor)
- Koefisien proksi mekanik/penggerak sendi: $k_{\text{vel},i} = 0.35\,\tau_{\text{rated},i}$, $k_{\text{acc},i} = 0.04\,\tau_{\text{rated},i}$
- Rugi penggerak resistif (tembaga, $I^2R$): $+\,k_{\text{res},i}\,\ddot{q}_i(t)^2$ per sendi dengan $k_{\text{res},i} = 0.010\,\tau_{\text{rated},i}$ (W per (rad/s²)²). Arus motor berskala dengan torsi, dan torsi berskala dengan akselerasi, sehingga daya yang terdisipasi tumbuh dengan $\ddot{q}^2$. Tanpa suku ini, energi per unit turun secara monoton terhadap kecepatan: daya standby idle mendominasi, sehingga "tercepat" selalu juga "paling efisien". Dengan suku ini, energi per unit memiliki minimum interior (sekitar kecepatan `1.0×`–`1.2×` dengan akselerasi yang dikurangi untuk sel baseline), dan `MIN_ENERGY_PER_UNIT` benar-benar berbeda dari `MIN_CYCLE_TIME`.
- Proksi angkat/bawa payload: $P_{\text{payload}} = 18.0 \cdot m_{\text{held}} \cdot \max(\|\dot{q}\|_2, 0.1)\text{ W}$ saat memegang workpiece
- Daya tambahan: $P_{\text{aux}} = 65\text{ W}$ per konveyor aktif + `180 W` selama `PROCESS_WORKPIECE`
- Kenaikan energi per tick: $\Delta E_{\text{J}} = P_{\text{total}}(t)\cdot \Delta t$, $\Delta E_{\text{Wh}} = \Delta E_{\text{J}} / 3600$.
- **Surrogate analitik (optimizer Python)**: `apps/api/app/analytics/surrogate.py` mengintegrasikan suku yang sama dalam bentuk tertutup pada setiap segmen quintic ($\int|\ddot{s}| = 3.75$, $\int\ddot{s}^2 = 120/7$ pada interval satuan) memakai batas sendi kanonis. Ia dikalibrasi terhadap engine dengan `cargo run --release --example energy_sweep -- --grid` dan mengikutinya dalam sekitar `1 %` untuk waktu siklus dan energi per unit pada kecepatan `0.5`–`1.4×`, belt `0.15`–`0.5 m/s`, dan dwell `1.2`–`3.5 s`.

---

## 8. Keterbatasan Simulasi yang Eksplisit

1. **Tanpa Dinamika Rigid-Body atau Fisika Gesekan**: Workpiece mengikuti gerak belt kinematik dan penempelan genggam yang kaku; terguling, selip, atau tabrakan deformabel berada di luar cakupan.
2. **Tanpa Perencana Jalur Penghindar Rintangan Dinamis**: Perencanaan trajektori memvalidasi busur waypoint bebas tabrakan dan membatalkan saat terjadi tabrakan, bukan menjalankan re-routing RRT*/PRM.
3. **Bounding Volume Aproksimasi**: Primitif capsule dan box mengaproksimasi mesh visual; kontak permukaan CAD sub-milimeter tidak dimodelkan.
4. **Proksi Energi Sintetis**: `P_total` memperkirakan perbandingan tren antar skenario; ia tidak memodelkan kurva efisiensi servo yang sebenarnya, pengereman regeneratif, atau faktor daya.
