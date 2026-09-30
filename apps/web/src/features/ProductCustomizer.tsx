import { Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { money } from "../lib/client";
import type { Catalog, CartLine, Product } from "../lib/types";
import { Modal } from "../components/ui";

type ProductCustomizerProps = {
  product: Product;
  catalog: Catalog;
  onAdd: (line: CartLine) => void;
  onClose: () => void;
};

export function ProductCustomizer({
  product,
  catalog,
  onAdd,
  onClose,
}: ProductCustomizerProps) {
  const variants = product.variants.filter((variant) => variant.active);
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const choiceSets = useMemo(
    () =>
      [...product.choice_sets].sort(
        (left, right) => left.position - right.position,
      ),
    [product.choice_sets],
  );
  const selectedVariant = variants.find((variant) => variant.id === variantId);

  const groups = choiceSets.map((choiceSet) => ({
    choiceSet,
    modifiers: catalog.modifiers.filter(
      (modifier) => modifier.active && modifier.group_id === choiceSet.group_id,
    ),
  }));

  const isValid =
    Boolean(selectedVariant) &&
    groups.every(({ choiceSet, modifiers }) => {
      const selected = modifiers.reduce(
        (total, modifier) => total + (counts[modifier.id] ?? 0),
        0,
      );
      return selected >= choiceSet.minimum && selected <= choiceSet.maximum;
    });

  const modifierIds = groups.flatMap(({ modifiers }) =>
    modifiers.flatMap((modifier) =>
      Array.from({ length: counts[modifier.id] ?? 0 }, () => modifier.id),
    ),
  );
  const modifiersTotal = modifierIds.reduce(
    (total, modifierId) =>
      total +
      (catalog.modifiers.find((modifier) => modifier.id === modifierId)
        ?.price_ngwee ?? 0),
    0,
  );
  const total =
    ((selectedVariant?.price_ngwee ?? 0) + modifiersTotal) * quantity;

  function changeCount(
    modifierId: string,
    delta: number,
    maximum: number,
    groupModifierIds: string[],
  ) {
    setCounts((current) => {
      const groupTotal = groupModifierIds.reduce(
        (sum, id) => sum + (current[id] ?? 0),
        0,
      );
      const next = Math.max(0, (current[modifierId] ?? 0) + delta);
      if (delta > 0 && groupTotal >= maximum) return current;
      return { ...current, [modifierId]: next };
    });
  }

  return (
    <Modal title={product.name} eyebrow="Add to sale" onClose={onClose}>
      <div className="customizer-panel">
        {variants.length > 1 ? (
          <fieldset className="customizer-set">
            <legend>Price choice</legend>
            <div className="choice-grid">
              {variants.map((variant) => (
                <button
                  className={
                    variant.id === variantId
                      ? "choice-card is-selected"
                      : "choice-card"
                  }
                  type="button"
                  key={variant.id}
                  onClick={() => setVariantId(variant.id)}
                >
                  <span>{variant.name}</span>
                  <strong>{money(variant.price_ngwee)}</strong>
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        {groups.map(({ choiceSet, modifiers }) => {
          const groupModifierIds = modifiers.map((modifier) => modifier.id);
          const selected = groupModifierIds.reduce(
            (sum, id) => sum + (counts[id] ?? 0),
            0,
          );
          return (
            <fieldset
              className="customizer-set"
              key={`${choiceSet.group_id}-${choiceSet.position}`}
            >
              <legend>{choiceSet.name}</legend>
              <div className="customizer-set-meta">
                <span>
                  {choiceSet.minimum === choiceSet.maximum
                    ? `Choose ${choiceSet.maximum}`
                    : `Choose ${choiceSet.minimum} to ${choiceSet.maximum}`}
                </span>
                <strong aria-live="polite">
                  {selected} of {choiceSet.maximum} selected
                </strong>
              </div>
              <div className="modifier-counter-list">
                {modifiers.map((modifier) => {
                  const count = counts[modifier.id] ?? 0;
                  return (
                    <div className="modifier-counter" key={modifier.id}>
                      <div>
                        <strong>{modifier.name}</strong>
                        {modifier.price_ngwee ? (
                          <span>+{money(modifier.price_ngwee)}</span>
                        ) : null}
                      </div>
                      <div className="counter-controls">
                        <button
                          type="button"
                          aria-label={`Remove ${modifier.name}`}
                          disabled={count === 0}
                          onClick={() =>
                            changeCount(
                              modifier.id,
                              -1,
                              choiceSet.maximum,
                              groupModifierIds,
                            )
                          }
                        >
                          <Minus aria-hidden="true" />
                        </button>
                        <output aria-label={`${modifier.name} quantity`}>
                          {count}
                        </output>
                        <button
                          type="button"
                          aria-label={`Add ${modifier.name}`}
                          disabled={selected >= choiceSet.maximum}
                          onClick={() =>
                            changeCount(
                              modifier.id,
                              1,
                              choiceSet.maximum,
                              groupModifierIds,
                            )
                          }
                        >
                          <Plus aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        <div className="customizer-footer">
          <div className="quantity-control" aria-label="Item quantity">
            <button
              type="button"
              aria-label="Decrease quantity"
              disabled={quantity === 1}
              onClick={() => setQuantity(quantity - 1)}
            >
              <Minus aria-hidden="true" />
            </button>
            <output>{quantity}</output>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => setQuantity(quantity + 1)}
            >
              <Plus aria-hidden="true" />
            </button>
          </div>
          <button
            className="button primary customizer-add"
            type="button"
            aria-label="Add to sale"
            disabled={!isValid}
            onClick={() =>
              onAdd({
                variant_id: variantId,
                quantity,
                modifier_ids: modifierIds,
                notes: "",
              })
            }
          >
            <span>Add to sale</span>
            <strong>{money(total)}</strong>
          </button>
        </div>
      </div>
    </Modal>
  );
}
