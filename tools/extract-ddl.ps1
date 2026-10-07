<#
.SYNOPSIS
    从 docs/database.md 抽取 SQL 代码块，生成 Flyway 迁移脚本。

.DESCRIPTION
    docs/database.md 是设计说明，db/migration/*.sql 是可执行真源（见 docs/dev-log.md D5）。
    为避免手工转录漂移，本脚本按模块把 DDL 机械抽取出来。

    用法（在项目根目录执行）：
        .\tools\extract-ddl.ps1

    注意：本文件必须以「带 BOM 的 UTF-8」保存，否则 Windows PowerShell 5.1 会按 GBK 解析，
          导致脚本内中文字符串乱码并报语法错误。
          脚本只负责搬运，不做语义校验；生成后必须用 MySQL 实际执行一遍才算验证。
#>
[CmdletBinding()]
param(
    [string]$Source = 'docs/database.md',
    [string]$OutDir = 'db/migration'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Source)) { throw "找不到源文件: $Source" }
if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

$lines = Get-Content -LiteralPath $Source -Encoding UTF8

# 抽取所有 ```sql 块，并按 CREATE TABLE 语句拆成「一表一块」
# 注意：database.md 中有的代码块里写了多张表（如 notes + note_tags + note_tag_rel），
#       若按整块归组会导致重复建表，因此必须按语句边界切分。
$blocks = @()
$start = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].Trim() -eq '```sql') { $start = $i + 1 }
    elseif ($lines[$i].Trim() -eq '```' -and $start -ge 0) {
        $chunkLines = $lines[$start..($i - 1)]
        $starts = @()
        for ($j = 0; $j -lt $chunkLines.Count; $j++) {
            if ($chunkLines[$j] -match '^CREATE TABLE\s+`?([a-z_]+)`?') {
                $starts += [pscustomobject]@{ Index = $j; Table = $Matches[1] }
            }
        }
        for ($k = 0; $k -lt $starts.Count; $k++) {
            $from = $starts[$k].Index
            $to = if ($k + 1 -lt $starts.Count) { $starts[$k + 1].Index - 1 } else { $chunkLines.Count - 1 }
            $text = ($chunkLines[$from..$to] -join [Environment]::NewLine).TrimEnd()
            if ($text.Length -gt 0) {
                $blocks += [pscustomobject]@{ Text = $text; Tables = @($starts[$k].Table) }
            }
        }
        $start = -1
    }
}

if ($blocks.Count -eq 0) { throw "未在 $Source 中找到任何 sql 代码块" }

# 表名 -> 目标迁移文件（归属对应 docs/dev-log.md D5）
$map = @{
    'users' = 'V1__init_user_and_plugin.sql'
    'user_settings' = 'V1__init_user_and_plugin.sql'
    'llm_providers' = 'V1__init_user_and_plugin.sql'
    'pet_settings' = 'V1__init_user_and_plugin.sql'
    'plugins' = 'V1__init_user_and_plugin.sql'
    'plugin_tools' = 'V1__init_user_and_plugin.sql'
    'plugin_configs' = 'V1__init_user_and_plugin.sql'
    'plugin_grants' = 'V1__init_user_and_plugin.sql'
    'study_goals' = 'V2__init_learning.sql'
    'study_tasks' = 'V2__init_learning.sql'
    'learning_sessions' = 'V2__init_learning.sql'
    'learning_session_daily' = 'V2__init_learning.sql'
    'knowledge_points' = 'V3__init_knowledge_ai_and_event.sql'
    'user_knowledge_mastery' = 'V3__init_knowledge_ai_and_event.sql'
    'notes' = 'V3__init_knowledge_ai_and_event.sql'
    'note_tags' = 'V3__init_knowledge_ai_and_event.sql'
    'note_tag_rel' = 'V3__init_knowledge_ai_and_event.sql'
    'questions' = 'V3__init_knowledge_ai_and_event.sql'
    'wrong_questions' = 'V3__init_knowledge_ai_and_event.sql'
    'ai_conversations' = 'V3__init_knowledge_ai_and_event.sql'
    'ai_messages' = 'V3__init_knowledge_ai_and_event.sql'
    'token_usages' = 'V3__init_knowledge_ai_and_event.sql'
    'agent_traces' = 'V3__init_knowledge_ai_and_event.sql'
    'domain_events' = 'V3__init_knowledge_ai_and_event.sql'
    'vector_collections' = 'V7__vector.sql'
    'vector_chunks' = 'V7__vector.sql'
}

# 每个文件的元信息行
$meta = @{
    'V1__init_user_and_plugin.sql' = @(
        'Description: init user & plugin modules (users/plugin registry/config/grants)'
        'Tables     : users, user_settings, llm_providers, pet_settings, plugins, plugin_tools, plugin_configs, plugin_grants'
        'Doc        : docs/database.md section 2.1, 2.2'
    )
    'V2__init_learning.sql' = @(
        'Description: init learning module (goals/tasks/sessions/daily aggregation)'
        'Tables     : study_goals, study_tasks, learning_sessions, learning_session_daily'
        'Doc        : docs/database.md section 2.3'
    )
    'V3__init_knowledge_ai_and_event.sql' = @(
        'Description: init knowledge & ai & event modules'
        'Tables     : knowledge_points, user_knowledge_mastery, notes, note_tags, note_tag_rel, questions, wrong_questions, ai_conversations, ai_messages, token_usages, agent_traces, domain_events'
        'Doc        : docs/database.md section 2.4, 2.5, 2.6'
    )
    'V7__vector.sql' = @(
        'Description: Phase 7 (RAG) vector tables - NOT applied during MVP'
        'Tables     : vector_collections, vector_chunks'
        'Doc        : docs/database.md section 8.3'
    )
}

$bucket = @{}
foreach ($f in ($map.Values | Sort-Object -Unique)) {
    $bucket[$f] = New-Object System.Collections.Generic.List[string]
}

foreach ($b in $blocks) {
    foreach ($t in $b.Tables) {
        if (-not $map.ContainsKey($t)) { Write-Warning "未归类的表: $t"; continue }
        $bucket[$map[$t]].Add($b.Text) | Out-Null
    }
}

$nl = [Environment]::NewLine
foreach ($file in ($bucket.Keys | Sort-Object)) {
    $headerLines = @('-- =============================================================')
    foreach ($m in $meta[$file]) { $headerLines += ('-- ' + $m) }
    $headerLines += '-- Generated by tools/extract-ddl.ps1 - extracted from docs/database.md'
    $headerLines += '-- 修改表结构：先改 docs/database.md，再重跑 tools/extract-ddl.ps1 生成新版本文件'
    $headerLines += '-- ============================================================='
    $headerLines += ''

    $content = ($headerLines -join $nl) + $nl + (($bucket[$file] | ForEach-Object { $_ }) -join ($nl + $nl)) + $nl

    $target = Join-Path $OutDir $file
    # 必须写 UTF-8 BOM：MySQL 客户端与 Flyway 对无 BOM 的中文 COMMENT 容易踩编码坑
    [System.IO.File]::WriteAllText((Resolve-Path -LiteralPath $OutDir).Path + '\' + $file, $content, (New-Object System.Text.UTF8Encoding($true)))

    Write-Host ("生成 {0,-40} 行数 {1,5}  表数 {2,2}" -f $file, ($content -split $nl).Count, $bucket[$file].Count)
}

Write-Host ''
Write-Host "完成。输出目录: $OutDir"
