import { useEffect, useMemo, useRef, useState } from 'react';
import {
  applyTemplateToRows,
  buildBaseTemplatesFromRows,
  buildDeviceTemplatesFromCsv,
  buildTemplatesZip,
  diffDeviceTemplate,
  parseDeviceTemplateYaml,
  resolveDeviceTemplateInheritance,
  serializeDeviceTemplate,
  type DeviceTemplate,
  type DeviceTemplateDiff,
  type DeviceTemplateProperty,
  type RowRecord,
  type TemplateAccess,
} from '@repo/core';
import { downloadFile } from '../utils/downloadFile';

function templateKey(t: DeviceTemplate): string {
  return `${t.namespace}:${t.deviceType}`;
}

type Props = {
  rows: RowRecord[];
  onApplyTemplate: (nextRows: RowRecord[]) => void;
  expertMode: boolean;
};

type NewProp = {
  name: string;
  pointType: string;
  access: TemplateAccess;
  description: string;
  default: string;
};

const EMPTY_NEW_PROP: NewProp = {
  name: '',
  pointType: '',
  access: 'read',
  description: '',
  default: '',
};

export function TemplatesView({ rows, onApplyTemplate, expertMode }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [drafts, setDrafts] = useState<Record<string, DeviceTemplate>>({});
  const [selectedKey, setSelectedKey] = useState('');
  const [newProp, setNewProp] = useState<NewProp>(EMPTY_NEW_PROP);
  const [loadError, setLoadError] = useState('');
  const [appliedToast, setAppliedToast] = useState('');

  const baseTemplates = useMemo(() => buildBaseTemplatesFromRows(rows), [rows]);
  const generatedTemplates = useMemo(
    () => [...baseTemplates, ...buildDeviceTemplatesFromCsv(rows)],
    [baseTemplates, rows],
  );

  const generatedMap = useMemo(
    () => new Map(generatedTemplates.map((t) => [templateKey(t), t])),
    [generatedTemplates],
  );

  const availableTemplates = useMemo(
    () => generatedTemplates.map((t) => drafts[templateKey(t)] ?? t),
    [generatedTemplates, drafts],
  );

  useEffect(() => {
    if (generatedTemplates.length === 0) {
      if (selectedKey) setSelectedKey('');
      return;
    }
    if (!selectedKey || !generatedMap.has(selectedKey)) {
      setSelectedKey(templateKey(generatedTemplates[0]));
    }
  }, [generatedTemplates, generatedMap, selectedKey]);

  const generated = selectedKey ? generatedMap.get(selectedKey) : undefined;
  const draft = selectedKey ? drafts[selectedKey] : undefined;
  const active = draft ?? generated;

  const resolved = useMemo<{ template?: DeviceTemplate; error?: string }>(() => {
    if (!active) return {};
    try {
      return { template: resolveDeviceTemplateInheritance(availableTemplates, active) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : '継承の解決に失敗しました。' };
    }
  }, [active, availableTemplates]);

  const diff = useMemo<DeviceTemplateDiff | undefined>(() => {
    if (!generated || !draft) return undefined;
    return diffDeviceTemplate(generated, draft);
  }, [generated, draft]);

  const extendOptions = useMemo(() => {
    if (!active) return [] as string[];
    const out: string[] = [];
    for (const t of availableTemplates) {
      if (t.className === active.className) continue;
      if (!out.includes(t.className)) out.push(t.className);
    }
    return out;
  }, [active, availableTemplates]);

  const updateDraft = (key: string, fn: (current: DeviceTemplate) => DeviceTemplate) => {
    if (!key) return;
    setDrafts((prev) => {
      const base = prev[key] ?? generatedMap.get(key);
      if (!base) return prev;
      return { ...prev, [key]: fn(base) };
    });
  };

  const setField = (field: 'className' | 'description' | 'extends', value: string) => {
    if (!selectedKey) return;
    updateDraft(selectedKey, (t) => ({
      ...t,
      [field]: field === 'extends' ? value || undefined : value,
    }));
  };

  const updateProperty = (name: string, patch: Partial<DeviceTemplateProperty>) => {
    if (!selectedKey) return;
    updateDraft(selectedKey, (t) => ({
      ...t,
      properties: t.properties.map((p) => (p.name === name ? { ...p, ...patch } : p)),
    }));
  };

  const removeProperty = (name: string) => {
    if (!selectedKey) return;
    updateDraft(selectedKey, (t) => ({
      ...t,
      properties: t.properties.filter((p) => p.name !== name),
    }));
  };

  const addProperty = () => {
    if (!selectedKey) return;
    const name = newProp.name.trim();
    if (!name) return;
    updateDraft(selectedKey, (t) => {
      if (t.properties.some((p) => p.name === name)) return t;
      const next: DeviceTemplateProperty = {
        name,
        description: newProp.description.trim() || undefined,
        access: newProp.access,
        default: newProp.default.trim() || undefined,
        pointType: newProp.pointType.trim() || name,
      };
      return {
        ...t,
        properties: [...t.properties, next].sort((a, b) => a.name.localeCompare(b.name)),
      };
    });
    setNewProp(EMPTY_NEW_PROP);
  };

  const handleLoadFile = async (file: File) => {
    if (!selectedKey) return;
    try {
      const text = await file.text();
      const parsed = parseDeviceTemplateYaml(text, {
        namespace: generated?.namespace ?? 'default',
        deviceType: generated?.deviceType ?? '',
      });
      updateDraft(selectedKey, () => parsed);
      setLoadError('');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'YAMLの読み込みに失敗しました。');
    }
  };

  const handleGenerate = () => {
    if (!selectedKey || !generated) return;
    updateDraft(selectedKey, () => generated);
  };

  const handleDownloadYaml = () => {
    if (!active) return;
    downloadFile(
      serializeDeviceTemplate(active),
      `${active.deviceType || 'template'}.yaml`,
      'text/yaml;charset=utf-8',
    );
  };

  const handleDownloadZip = async () => {
    if (availableTemplates.length === 0) return;
    const zipBytes = await buildTemplatesZip(availableTemplates);
    downloadFile(zipBytes, 'device-templates.zip', 'application/zip');
  };

  const handleApplyToCsv = () => {
    if (!resolved.template) return;
    const next = applyTemplateToRows(rows, resolved.template);
    onApplyTemplate(next);
    setAppliedToast(`「${resolved.template.deviceType}」を ${next.length} 行に反映しました。`);
    window.setTimeout(() => setAppliedToast(''), 3000);
  };

  const extraSet = new Set(diff?.extra.map((p) => p.name) ?? []);
  const mismatchedSet = new Set(diff?.mismatched.map((m) => m.name) ?? []);
  const missingSet = new Set(diff?.missing.map((p) => p.name) ?? []);

  if (generatedTemplates.length === 0) {
    return (
      <div className="workspace" data-testid="templates-view">
        <div className="workspace-header">
          <div className="crumb">
            <span className="crumb-current">デバイステンプレート</span>
          </div>
        </div>
        <div className="empty-state">
          <div>
            <div className="ic">📋</div>
            <div className="title">テンプレートがありません</div>
            <div>CSVを読み込むと、デバイス種別ごとのテンプレートが自動生成されます。</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace templates-workspace" data-testid="templates-view">
      <div className="workspace-header">
        <div className="crumb">
          <span className="crumb-current">デバイステンプレート</span>
        </div>
      </div>

      {!expertMode && (
        <div style={{ padding: '12px 18px 0' }}>
          <div className="coach">
            <span className="coach-icon">i</span>
            <span>
              <b>デバイステンプレート</b>
              は、デバイス種別ごとに共通して持つべきプロパティを定義したものです。CSVから自動推定し、編集してYAMLやZIPで保存できます。「
              <b>CSVへ反映</b>」を押すと、現在のテンプレートをCSVの各デバイスに適用します。
            </span>
          </div>
        </div>
      )}

      <div className="templates-body">
        <aside className="templates-list" data-testid="template-list">
          <div className="panel-header">
            <h3>
              デバイス種別 <span className="count">{generatedTemplates.length}</span>
            </h3>
          </div>
          <div className="templates-list-body">
            {generatedTemplates.map((t) => {
              const key = templateKey(t);
              const isSelected = selectedKey === key;
              const hasDraft = !!drafts[key];
              return (
                <div
                  key={key}
                  className={'template-item' + (isSelected ? ' selected' : '')}
                  onClick={() => setSelectedKey(key)}
                  data-testid={`template-item-${t.deviceType}`}
                  role="button"
                  tabIndex={0}
                >
                  <div className="template-item-name">{t.deviceType || '(未指定)'}</div>
                  <div className="template-item-meta">
                    <span className="mono">ns: {t.namespace}</span>
                    {hasDraft && <span className="badge-edit">編集中</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="templates-detail">
          <div className="templates-toolbar">
            <button
              className="btn"
              onClick={handleGenerate}
              disabled={!generated}
              data-testid="template-generate"
              title="CSVから推定したテンプレートで上書き"
            >
              CSVから生成
            </button>
            <button
              className="btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={!generated}
              data-testid="template-load"
            >
              YAML読込
            </button>
            <button
              className="btn"
              onClick={handleDownloadYaml}
              disabled={!active}
              data-testid="template-download"
            >
              <span className="ic">↓</span> YAML保存
            </button>
            <button
              className="btn btn-primary"
              onClick={handleApplyToCsv}
              disabled={!resolved.template}
              data-testid="template-apply"
            >
              CSVへ反映
            </button>
            <button
              className="btn"
              onClick={handleDownloadZip}
              disabled={availableTemplates.length === 0}
              data-testid="template-zip"
            >
              <span className="ic">↓</span> 全テンプレートZIP
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".yaml,.yml,text/yaml"
              style={{ display: 'none' }}
              data-testid="template-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleLoadFile(file);
                e.target.value = '';
              }}
            />
          </div>

          {appliedToast && (
            <div className="template-toast template-toast-success">{appliedToast}</div>
          )}
          {loadError && <div className="template-toast template-toast-error">⚠ {loadError}</div>}
          {resolved.error && (
            <div className="template-toast template-toast-error">⚠ {resolved.error}</div>
          )}

          {!active ? (
            <div className="empty-state">
              <div>
                <div className="ic">👈</div>
                <div className="title">左のリストからテンプレートを選択</div>
              </div>
            </div>
          ) : (
            <>
              <div className="template-fields">
                <label>
                  <span>className</span>
                  <input
                    value={active.className}
                    onChange={(e) => setField('className', e.target.value)}
                  />
                </label>
                <label>
                  <span>説明</span>
                  <input
                    value={active.description ?? ''}
                    onChange={(e) => setField('description', e.target.value)}
                  />
                </label>
                <label>
                  <span>継承元</span>
                  <select
                    value={active.extends ?? ''}
                    onChange={(e) => setField('extends', e.target.value)}
                  >
                    <option value="">なし</option>
                    {extendOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {diff &&
              (diff.missing.length > 0 || diff.extra.length > 0 || diff.mismatched.length > 0) ? (
                <div className="template-diff" data-testid="template-diff">
                  <div className="template-diff-title">⚠ CSVとの差分</div>
                  <ul>
                    {diff.missing.map((p) => (
                      <li key={`m-${p.name}`}>
                        <b>不足:</b> <span className="mono">{p.name}</span>
                      </li>
                    ))}
                    {diff.extra.map((p) => (
                      <li key={`e-${p.name}`}>
                        <b>過剰:</b> <span className="mono">{p.name}</span>
                      </li>
                    ))}
                    {diff.mismatched.map((m) => (
                      <li key={`x-${m.name}`}>
                        <b>不一致:</b> <span className="mono">{m.name}</span>（
                        {m.differences.join(', ')}）
                      </li>
                    ))}
                  </ul>
                </div>
              ) : draft ? (
                <div className="template-diff template-diff-ok" data-testid="template-no-diff">
                  ✓ CSV推定値と一致しています
                </div>
              ) : null}

              <div className="template-add" data-testid="template-property-form">
                <input
                  placeholder="プロパティ名"
                  value={newProp.name}
                  onChange={(e) => setNewProp((p) => ({ ...p, name: e.target.value }))}
                />
                <input
                  placeholder="pointType"
                  value={newProp.pointType}
                  onChange={(e) => setNewProp((p) => ({ ...p, pointType: e.target.value }))}
                />
                <select
                  value={newProp.access}
                  onChange={(e) =>
                    setNewProp((p) => ({ ...p, access: e.target.value as TemplateAccess }))
                  }
                >
                  <option value="read">read</option>
                  <option value="readWrite">readWrite</option>
                </select>
                <input
                  placeholder="説明"
                  value={newProp.description}
                  onChange={(e) => setNewProp((p) => ({ ...p, description: e.target.value }))}
                />
                <input
                  placeholder="デフォルト値"
                  value={newProp.default}
                  onChange={(e) => setNewProp((p) => ({ ...p, default: e.target.value }))}
                />
                <button
                  className="btn btn-primary"
                  onClick={addProperty}
                  disabled={!newProp.name.trim()}
                  data-testid="template-property-add"
                >
                  ＋ 追加
                </button>
              </div>

              <div className="template-properties" data-testid="template-properties-grid">
                <table className="grid">
                  <thead>
                    <tr>
                      <th>プロパティ名</th>
                      <th>pointType</th>
                      <th>アクセス</th>
                      <th>説明</th>
                      <th>デフォルト</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.properties.map((p) => {
                      const cls = mismatchedSet.has(p.name)
                        ? 'template-row-mismatch'
                        : extraSet.has(p.name)
                          ? 'template-row-extra'
                          : missingSet.has(p.name)
                            ? 'template-row-missing'
                            : '';
                      return (
                        <tr key={p.name} className={cls}>
                          <td className="mono">{p.name}</td>
                          <td>
                            <input
                              value={p.pointType}
                              onChange={(e) =>
                                updateProperty(p.name, { pointType: e.target.value })
                              }
                            />
                          </td>
                          <td>
                            <select
                              value={p.access}
                              onChange={(e) =>
                                updateProperty(p.name, { access: e.target.value as TemplateAccess })
                              }
                            >
                              <option value="read">read</option>
                              <option value="readWrite">readWrite</option>
                            </select>
                          </td>
                          <td>
                            <input
                              value={p.description ?? ''}
                              onChange={(e) =>
                                updateProperty(p.name, { description: e.target.value || undefined })
                              }
                            />
                          </td>
                          <td>
                            <input
                              value={p.default ?? ''}
                              onChange={(e) =>
                                updateProperty(p.name, { default: e.target.value || undefined })
                              }
                            />
                          </td>
                          <td>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => removeProperty(p.name)}
                              title="削除"
                              aria-label={`${p.name}を削除`}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
