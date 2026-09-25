import { ArrowDown, ArrowUp, ImagePlus, Plus, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const MAX_FLYER_ITEMS = 60;
export const MAX_FEATURED = 3;
export const UNIT_SUGGESTIONS = ['UNIDADE', 'KG', '100G', 'BANDEJA', 'PACOTE', 'LITRO'];

export interface FlyerItemDraft {
  name: string;
  price: string;
  oldPrice: string;
  unit: string;
  featured: boolean;
  imageUrl: string | null;
}

export const emptyFlyerItem = (): FlyerItemDraft => ({ name: '', price: '', oldPrice: '', unit: '', featured: false, imageUrl: null });

interface Props {
  items: FlyerItemDraft[];
  errors: Record<number, string>;
  uploadingIndex: number | null;
  onChange: (index: number, patch: Partial<FlyerItemDraft>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onMove: (index: number, delta: -1 | 1) => void;
  onPickImage: (index: number, file: File) => void;
}

export function FlyerItemsTable({ items, errors, uploadingIndex, onChange, onAdd, onRemove, onMove, onPickImage }: Props) {
  const featuredCount = items.filter((i) => i.featured).length;
  return (
    <div className="space-y-3">
      <datalist id="flyer-units">
        {UNIT_SUGGESTIONS.map((u) => <option key={u} value={u} />)}
      </datalist>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">Destaque</TableHead>
            <TableHead className="w-20">Foto</TableHead>
            <TableHead>Produto</TableHead>
            <TableHead className="w-28">Preço</TableHead>
            <TableHead className="w-28">Preço antigo</TableHead>
            <TableHead className="w-32">Unidade</TableHead>
            <TableHead className="w-32" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => (
            <TableRow key={index} aria-invalid={index in errors}>
              <TableCell>
                <label className="flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="sr-only"
                    aria-label={`Destaque ${item.name || `linha ${index + 1}`}`}
                    checked={item.featured}
                    onChange={(e) => onChange(index, { featured: e.target.checked })}
                  />
                  <Star className={item.featured ? 'fill-yellow-400 text-yellow-500' : 'text-muted-foreground'} />
                </label>
              </TableCell>
              <TableCell>
                <label className="flex h-14 w-14 cursor-pointer items-center justify-center overflow-hidden rounded border">
                  {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-contain" /> : <ImagePlus className="h-5 w-5" />}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    aria-label={`Foto de ${item.name || `linha ${index + 1}`}`}
                    disabled={uploadingIndex !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onPickImage(index, file);
                      e.target.value = '';
                    }}
                  />
                </label>
              </TableCell>
              <TableCell>
                <Input value={item.name} placeholder="Nome do produto" maxLength={120} onChange={(e) => onChange(index, { name: e.target.value })} />
                {errors[index] ? <p className="mt-1 text-xs text-destructive">{errors[index]}</p> : null}
              </TableCell>
              <TableCell>
                <Input value={item.price} placeholder="0,00" inputMode="decimal" onChange={(e) => onChange(index, { price: e.target.value })} />
              </TableCell>
              <TableCell>
                <Input value={item.oldPrice} placeholder="opcional" inputMode="decimal" onChange={(e) => onChange(index, { oldPrice: e.target.value })} />
              </TableCell>
              <TableCell>
                <Input value={item.unit} list="flyer-units" maxLength={12} placeholder="UNIDADE" onChange={(e) => onChange(index, { unit: e.target.value })} />
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button type="button" size="icon" variant="ghost" aria-label="Subir" disabled={index === 0} onClick={() => onMove(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" aria-label="Descer" disabled={index === items.length - 1} onClick={() => onMove(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" aria-label="Remover" onClick={() => onRemove(index)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <Button type="button" variant="outline" onClick={onAdd} disabled={items.length >= MAX_FLYER_ITEMS}>
          <Plus className="mr-1 h-4 w-4" /> Adicionar produto
        </Button>
        <span>{items.length}/{MAX_FLYER_ITEMS}</span>
      </div>
      {featuredCount > MAX_FEATURED ? (
        <p className="text-sm text-amber-600">Só os 3 primeiros vão para a faixa; os outros destaques entram na grade.</p>
      ) : null}
    </div>
  );
}
