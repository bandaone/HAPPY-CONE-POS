import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Compass, ListChecks, ShoppingBag, WifiOff } from "lucide-react";
import { Modal } from "../components/ui";
import type { Role } from "../lib/types";

type TourPage = "pos" | "sales" | "inventory" | "day" | "reports" | "settings";

interface TourStep {
  title: string;
  eyebrow: string;
  copy: string;
  note: string;
  page?: TourPage;
  icon: typeof Compass;
}

function roleSteps(role: Role): TourStep[] {
  const shared: TourStep[] = [
    {
      title: "Welcome to your counter",
      eyebrow: "Your first shift",
      copy: "Take a short guided look at the tools you will use. Nothing is changed while you move through this tour.",
      note: "You can leave now and restart the tour from Help at any time.",
      icon: Compass,
    },
    {
      title: "Find your way around",
      eyebrow: "Navigation",
      copy: "Your available work areas are in the side rail. On a phone, the same controls move to the bottom of the screen.",
      note: "The system only shows the areas allowed for your staff role.",
      icon: ListChecks,
    },
  ];

  return [...shared,
    {
      title: "Build and complete a sale",
      eyebrow: "Counter",
      copy: "Choose a product, confirm its size and extras, then review the sale before taking payment. The sale is recorded before its receipt is printed.",
      note: "Open the business day before the first payment. Cashiers can ask a manager when a correction is needed.",
      page: "pos",
      icon: ShoppingBag,
    },
    {
      title: role === "CASHIER" ? "Your counter is ready" : "Keep the whole stand in view",
      eyebrow: role === "CASHIER" ? "Start serving" : "Daily oversight",
      copy: role === "CASHIER"
        ? "Sales keeps every completed receipt available. Cash day shows the opening float and the information needed at handover."
        : "Use Stock to create menu items, set prices, define recipes and manage inventory. Reports and Cash day cover performance and reconciliation.",
      note: "Settings holds staff access, receipt details and operating guidance. The connection indicator shows when cash sales are waiting to sync.",
      page: role === "CASHIER" ? "sales" : "inventory",
      icon: role === "CASHIER" ? WifiOff : ListChecks,
    },
  ];
}

export function ProductTour({ role, onNavigate, onFinish }: { role: Role; onNavigate: (page: TourPage) => void; onFinish: () => void }) {
  const [index, setIndex] = useState(0);
  const steps = roleSteps(role);
  const step = steps[index];
  const Icon = step.icon;

  useEffect(() => {
    if (step.page) onNavigate(step.page);
  }, [step.page, onNavigate]);

  return <Modal title={step.title} eyebrow={step.eyebrow} onClose={onFinish}>
    <div className="tour-body">
      <div className="tour-icon" aria-hidden="true"><Icon size={27} strokeWidth={1.7}/></div>
      <p className="tour-progress" aria-label={`Step ${index + 1} of ${steps.length}`}>{index + 1} of {steps.length}</p>
      <p className="tour-copy">{step.copy}</p>
      <p className="tour-note">{step.note}</p>
      <div className="tour-dots" aria-hidden="true">{steps.map((_, dot) => <span key={dot} className={dot === index ? "active" : ""}/>)}</div>
    </div>
    <div className="modal-footer tour-actions">
      <button className="text-button" type="button" onClick={onFinish}>Skip tour</button>
      <div>
        {index > 0 && <button className="button" type="button" onClick={() => setIndex(value => value - 1)}><ArrowLeft size={16}/>Back</button>}
        {index < steps.length - 1
          ? <button className="button primary" type="button" onClick={() => setIndex(value => value + 1)}>Next<ArrowRight size={16}/></button>
          : <button className="button primary" type="button" onClick={onFinish}>Start work<CheckCircle2 size={16}/></button>}
      </div>
    </div>
  </Modal>;
}
