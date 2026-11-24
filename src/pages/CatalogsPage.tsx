import { useState, type FormEvent } from "react";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { api, materialLabel, type Brand, type Material } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { Badge, Button, Card, CardBody, CardHeader, IconButton, Input, Modal } from "../components/ui";
import styles from "./Pages.module.css";

type Editing = { kind: "brand"; item?: Brand } | { kind: "material"; item?: Material } | null;

export function CatalogsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const brands = useLoad(() => api.listBrands(showArchived), [showArchived]);
  const materials = useLoad(() => api.listMaterials(showArchived), [showArchived]);

  const reloadAll = () => {
    brands.reload();
    materials.reload();
  };

  const toggleArchive = async (kind: "brand" | "material", id: number, archived: boolean) => {
    setActionError(null);
    try {
      if (kind === "brand") await api.setBrandArchived(id, archived);
      else await api.setMaterialArchived(id, archived);
      reloadAll();
    } catch (e) {
      setActionError(String(e));
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Mostrar archivados
        </label>
      </div>
      {actionError && <p className={styles.error} role="alert">{actionError}</p>}

      <Card>
        <CardHeader
          title="Marcas"
          description="Fabricantes de los filamentos."
          actions={
            <Button variant="primary" icon={Plus} onClick={() => setEditing({ kind: "brand" })}>
              Nueva marca
            </Button>
          }
        />
        <CardBody flush>
          {brands.error && <p className={styles.error} role="alert">{brands.error}</p>}
          <ul className={styles.list}>
            {brands.data?.map((b) => (
              <li key={b.id} className={styles.row}>
                <span className={styles.rowTitle}>{b.name}</span>
                {b.archived && <Badge variant="neutral">Archivada</Badge>}
                <span className={styles.rowActions}>
                  <IconButton icon={Pencil} label={`Editar ${b.name}`} onClick={() => setEditing({ kind: "brand", item: b })} />
                  <IconButton
                    icon={b.archived ? ArchiveRestore : Archive}
                    label={b.archived ? `Desarchivar ${b.name}` : `Archivar ${b.name}`}
                    onClick={() => toggleArchive("brand", b.id, !b.archived)}
                  />
                </span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Materiales"
          description="Tipos de filamento. Una variante (por ejemplo PLA High Speed) distingue cada tipo."
          actions={
            <Button variant="primary" icon={Plus} onClick={() => setEditing({ kind: "material" })}>
              Nuevo material
            </Button>
          }
        />
        <CardBody flush>
          {materials.error && <p className={styles.error} role="alert">{materials.error}</p>}
          <ul className={styles.list}>
            {materials.data?.map((m) => (
              <li key={m.id} className={styles.row}>
                <span className={styles.rowTitle}>{materialLabel(m)}</span>
                {m.archived && <Badge variant="neutral">Archivado</Badge>}
                <span className={styles.rowActions}>
                  <IconButton icon={Pencil} label={`Editar ${materialLabel(m)}`} onClick={() => setEditing({ kind: "material", item: m })} />
                  <IconButton
                    icon={m.archived ? ArchiveRestore : Archive}
                    label={m.archived ? `Desarchivar ${materialLabel(m)}` : `Archivar ${materialLabel(m)}`}
                    onClick={() => toggleArchive("material", m.id, !m.archived)}
                  />
                </span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {editing?.kind === "brand" && (
        <BrandModal
          brand={editing.item}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reloadAll();
          }}
        />
      )}
      {editing?.kind === "material" && (
        <MaterialModal
          material={editing.item}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reloadAll();
          }}
        />
      )}
    </div>
  );
}

function BrandModal({ brand, onClose, onSaved }: { brand?: Brand; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(brand?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.saveBrand(brand?.id ?? null, name);
      onSaved();
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={brand ? "Editar marca" : "Nueva marca"}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="brand-form" loading={saving}>Guardar</Button>
        </>
      }
    >
      <form id="brand-form" onSubmit={submit} className={styles.form}>
        <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} autoFocus error={error ?? undefined} />
      </form>
    </Modal>
  );
}

function MaterialModal({ material, onClose, onSaved }: { material?: Material; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(material?.name ?? "");
  const [variant, setVariant] = useState(material?.variant ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.saveMaterial(material?.id ?? null, name, variant.trim() === "" ? null : variant);
      onSaved();
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={material ? "Editar material" : "Nuevo material"}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="material-form" loading={saving}>Guardar</Button>
        </>
      }
    >
      <form id="material-form" onSubmit={submit} className={styles.form}>
        <Input label="Material" placeholder="PLA, PETG, PEBA…" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <Input label="Variante" placeholder="High Speed, Silk… (opcional)" value={variant} onChange={(e) => setVariant(e.target.value)} error={error ?? undefined} />
      </form>
    </Modal>
  );
}
