import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { PetState, usePetMachine, type PetStateId } from './pet/usePetMachine';
import './App.css';

type BackendStatus = 'checking' | 'online' | 'offline';

/**
 * 桌宠主窗口。
 *
 * Phase 1 范围（见 docs/roadmap.md）：
 *   - 桌宠窗口 + 状态机可视化 + 后端连通性检测。
 * 不包含：AI 对话、番茄钟、学习记录 —— 这些在后续 Phase，且必须走后端接口，
 * 前端只负责渲染（docs/architecture.md 第 1 节：前端不做业务计算）。
 *
 * TODO(Phase 1 续)：接入真实角色素材（assets/ 状态图鉴拆分后的序列帧或 Lottie），
 *   替换当前 CSS 占位角色。状态机接口不变。
 */
function App() {
  const pet = usePetMachine(PetState.Idle);
  const [backend, setBackend] = useState<BackendStatus>('checking');
  const [baseUrl, setBaseUrl] = useState('');
  const [showDebug, setShowDebug] = useState(false);

  // 后端连通性：后端由开发者手动启动（Phase 2 起改为 Tauri 托管）
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const url = await invoke<string>('backend_base_url');
        if (cancelled) return;
        setBaseUrl(url);
        const res = await fetch(`${url}/actuator/health`, { signal: AbortSignal.timeout(3000) });
        if (!cancelled) setBackend(res.ok ? 'online' : 'offline');
      } catch {
        if (!cancelled) setBackend('offline');
      }
    };
    check();
    const timer = window.setInterval(check, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const statusText =
    backend === 'online' ? '后端已连接' : backend === 'checking' ? '连接中…' : '后端未启动';

  return (
    <main className="pet-root" data-state={pet.state}>
      <div className="pet-stage">
        <div className="pet-body" title={`状态：${pet.meta.label}`}>
          <div className="pet-tail" />
          <div className="pet-eye eye-left" />
          <div className="pet-eye eye-right" />
          <div className="pet-mouth" />
        </div>
        <div className="pet-bubble">
          {pet.meta.label}
          {pet.expression ? ` · ${pet.expression}` : ''}
        </div>
      </div>

      <div className={`pet-status pet-status-${backend}`}>
        <span className="pet-dot" />
        {statusText}
      </div>

      <button className="pet-debug-toggle" onClick={() => setShowDebug((v) => !v)}>
        {showDebug ? '收起调试' : '状态调试'}
      </button>

      {showDebug && (
        <div className="pet-debug">
          <div className="pet-debug-row">
            <span className="pet-debug-label">常驻态</span>
            <button onClick={() => pet.setBaseState(PetState.Idle)}>待机</button>
            <button onClick={() => pet.setBaseState(PetState.Learning)}>学习中</button>
            <button onClick={() => pet.setBaseState(PetState.Sleep)}>睡眠</button>
          </div>
          <div className="pet-debug-row">
            <span className="pet-debug-label">事件</span>
            <button onClick={() => pet.dispatchAction('LEARNING_FINISHED')}>学习完成</button>
            <button onClick={() => pet.dispatchAction('QUESTION_WRONG')}>答错</button>
            <button onClick={() => pet.dispatchAction('STREAK_ACHIEVED')}>连续学习</button>
          </div>
          <div className="pet-debug-row">
            <span className="pet-debug-label">系统</span>
            <button onClick={() => pet.dispatchAction('AI_THINKING')}>AI 处理</button>
            <button onClick={() => pet.dispatchAction('AI_REPLYING')}>对话中</button>
            <button onClick={() => pet.resetToBase()}>复位</button>
          </div>
          <p className="pet-debug-hint">
            规则：system &gt; event &gt; ambient；单次状态自动回落。
            {baseUrl ? ` 后端 ${baseUrl}` : ''}
          </p>
        </div>
      )}
    </main>
  );
}

export type { PetStateId };
export default App;
