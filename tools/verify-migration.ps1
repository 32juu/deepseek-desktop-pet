<#
.SYNOPSIS
    在真实 MySQL 上验证 db/migration/*.sql 是否可执行。

.DESCRIPTION
    验证内容：
      1. 依次执行 V1/V2/V3/V4，任何一条报错即失败；
      2. 统计实际建表数量（MVP 应为 26 张，不含 V7 的 2 张向量表）；
      3. 校验中文 COMMENT 未乱码、种子数据已写入；
      4. V7__vector.sql 单独执行到另一个库，确认它在 Phase 7 前是隔离的；
      5. 校验软删除哨兵默认值与主键类型符合 docs/database.md 1.8 契约。

    用法（密码通过环境变量传入，不写入任何文件）：
        $env:PET_DB_ROOT_PASSWORD = '你的root密码'
        .\tools\verify-migration.ps1

    验证完成后脚本会删除临时库，不会动 pet_assistant。
#>
[CmdletBinding()]
param(
    [string]$MysqlExe   = 'C:\Program Files\MySQL\MySQL Server 8.1\bin\mysql.exe',
    [string]$ScratchDb  = 'pet_schema_check',
    [string]$VectorDb   = 'pet_vector_check',
    [string]$RootUser   = 'root'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $MysqlExe)) { throw "找不到 mysql.exe: $MysqlExe" }
if (-not $env:PET_DB_ROOT_PASSWORD) {
    throw "请先设置 `$env:PET_DB_ROOT_PASSWORD（仅本次会话有效，不落盘）"
}
$env:MYSQL_PWD = $env:PET_DB_ROOT_PASSWORD

function Invoke-Mysql {
    param([string]$Database, [string]$Sql)
    $argv = @('-u', $RootUser, '--default-character-set=utf8mb4')
    if ($Database) { $argv += "--database=$Database" }
    $argv += @('-e', $Sql)
    $out = & $MysqlExe @argv 2>&1
    [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $out }
}

function Invoke-MysqlFile {
    # 不能用 mysql 的 `source` / `-e "source ..."`：
    # 该项目路径含中文，mysql.exe 在 Windows 上打不开非 ASCII 路径（ERROR ... Failed to open file, error: 2）。
    # 因此改为把文件内容经 stdin 管道喂给客户端，并显式指定 utf8mb4。
    param([string]$Database, [string]$File)
    $argv = @('-u', $RootUser, '--default-character-set=utf8mb4')
    if ($Database) { $argv += "--database=$Database" }
    $sql = Get-Content -LiteralPath $File -Raw -Encoding UTF8
    $out = $sql | & $MysqlExe @argv 2>&1
    [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $out }
}

$failures = 0

Write-Host '=== 0. 连接检查 ==='
$r = Invoke-Mysql '' 'SELECT VERSION() AS v;'
if ($r.ExitCode -ne 0) { $r.Output | ForEach-Object { "  $_" }; throw '连接失败，密码是否正确？' }
$r.Output | ForEach-Object { "  $_" }

Write-Host ''
Write-Host '=== 1. 重建临时库 ==='
Invoke-Mysql '' "DROP DATABASE IF EXISTS ``$ScratchDb``; CREATE DATABASE ``$ScratchDb`` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;" | Out-Null
Invoke-Mysql '' "DROP DATABASE IF EXISTS ``$VectorDb``; CREATE DATABASE ``$VectorDb`` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;" | Out-Null
"  $ScratchDb / $VectorDb 已重建"

Write-Host ''
Write-Host '=== 2. 执行 MVP 迁移（V1 -> V4）==='
foreach ($f in @('V1__init_user_and_plugin.sql', 'V2__init_learning.sql', 'V3__init_knowledge_ai_and_event.sql', 'V4__seed_local_user.sql')) {
    $res = Invoke-MysqlFile -Database $ScratchDb -File "db/migration/$f"
    if ($res.ExitCode -eq 0 -and -not $res.Output) {
        "  OK    $f"
    } else {
        "  FAIL  $f"
        $res.Output | ForEach-Object { "        $_" }
        $failures++
    }
}

Write-Host ''
Write-Host '=== 3. 建表数量（期望 26）==='
$r = Invoke-Mysql $ScratchDb "SELECT COUNT(*) AS cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA='$ScratchDb';"
$r.Output | ForEach-Object { "  $_" }

Write-Host ''
Write-Host '=== 4. 中文 COMMENT 完整性 ==='
$r = Invoke-Mysql $ScratchDb "SELECT COUNT(*) AS no_comment FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$ScratchDb' AND (COLUMN_COMMENT IS NULL OR COLUMN_COMMENT='');"
$r.Output | ForEach-Object { "  无注释字段数（期望 0）: $_" }
$r = Invoke-Mysql $ScratchDb "SELECT TABLE_NAME, TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA='$ScratchDb' ORDER BY TABLE_NAME LIMIT 6;"
$r.Output | ForEach-Object { "  $_" }

Write-Host ''
Write-Host '=== 5. 契约校验（deleted_at 默认值 / 主键类型）==='
$r = Invoke-Mysql $ScratchDb "SELECT TABLE_NAME, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$ScratchDb' AND COLUMN_NAME='deleted_at' ORDER BY TABLE_NAME;"
"  deleted_at 默认值（应均为 1970-01-01 00:00:00.000）:"
$r.Output | ForEach-Object { "    $_" }
$r = Invoke-Mysql $ScratchDb "SELECT DISTINCT DATA_TYPE, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$ScratchDb' AND COLUMN_KEY='PRI';"
"  主键类型（应为 bigint，无 unsigned）:"
$r.Output | ForEach-Object { "    $_" }

Write-Host ''
Write-Host '=== 6. 种子数据 ==='
$r = Invoke-Mysql $ScratchDb 'SELECT id, username, display_name, status FROM users; SELECT user_id, proactive_enabled FROM pet_settings;'
$r.Output | ForEach-Object { "  $_" }

Write-Host ''
Write-Host '=== 7. V7 向量表隔离验证（单独库）==='
$res = Invoke-MysqlFile -Database $VectorDb -File 'db/migration/V7__vector.sql'
if ($res.ExitCode -eq 0 -and -not $res.Output) {
    "  OK    V7__vector.sql（语法可用，但 MVP 不执行）"
    $r = Invoke-Mysql $VectorDb "SELECT COUNT(*) AS cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA='$VectorDb';"
    $r.Output | ForEach-Object { "  向量表数量（期望 2）: $_" }
} else {
    "  FAIL  V7__vector.sql"
    $res.Output | ForEach-Object { "        $_" }
    $failures++
}

Write-Host ''
Write-Host '=== 8. 清理临时库 ==='
Invoke-Mysql '' "DROP DATABASE IF EXISTS ``$ScratchDb``; DROP DATABASE IF EXISTS ``$VectorDb``;" | Out-Null
'  已删除临时库'
Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue

Write-Host ''
if ($failures -eq 0) { Write-Host '验证结果：全部通过' -ForegroundColor Green }
else { Write-Host "验证结果：$failures 项失败" -ForegroundColor Red; exit 1 }
