import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SalonService as SalonServiceModel } from '../../../core/models/service.model';
import { SalonService } from '../../../core/services/salon.service';
import { ToastService } from '../../../core/services/toast.service';
import { extractErrorMessage } from '../../../core/utils/http-error.util';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { fadeIn } from '../../../shared/animations/fade-slide.animation';

@Component({
  selector: 'app-services-manager',
  imports: [FormsModule, SkeletonComponent],
  templateUrl: './services-manager.component.html',
  styleUrl: './services-manager.component.scss',
  animations: [fadeIn],
})
export class ServicesManagerComponent implements OnInit {
  private readonly salonService = inject(SalonService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly services = signal<SalonServiceModel[]>([]);
  readonly showForm = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly saving = signal(false);

  readonly formName = signal('');
  readonly formPrice = signal<number | null>(null);
  readonly formDuration = signal<number | null>(null);
  readonly formCategory = signal('');

  private salonId = '';

  async ngOnInit(): Promise<void> {
    const salon = this.salonService.salon();
    if (!salon) return;
    this.salonId = salon.id;
    await this.refresh();
  }

  openCreate(): void {
    this.editingId.set(null);
    this.formName.set('');
    this.formPrice.set(null);
    this.formDuration.set(null);
    this.formCategory.set('');
    this.showForm.set(true);
  }

  openEdit(service: SalonServiceModel): void {
    this.editingId.set(service.id);
    this.formName.set(service.name);
    this.formPrice.set(service.price);
    this.formDuration.set(service.durationMinutes);
    this.formCategory.set(service.category ?? '');
    this.showForm.set(true);
  }

  cancelForm(): void {
    this.showForm.set(false);
  }

  async submitForm(): Promise<void> {
    if (!this.formName().trim() || !this.formPrice() || !this.formDuration()) {
      this.toast.error('Name, price and duration are required');
      return;
    }

    this.saving.set(true);
    try {
      const payload = {
        name: this.formName().trim(),
        price: this.formPrice()!,
        durationMinutes: this.formDuration()!,
        category: this.formCategory().trim() || undefined,
      };

      if (this.editingId()) {
        await this.salonService.updateService(this.editingId()!, payload);
        this.toast.success('Service updated');
      } else {
        await this.salonService.createService(this.salonId, payload);
        this.toast.success('Service added');
      }

      this.showForm.set(false);
      await this.refresh();
    } catch (error) {
      this.toast.error(extractErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  async toggleActive(service: SalonServiceModel): Promise<void> {
    try {
      await this.salonService.updateService(service.id, {
        isActive: !service.isActive,
      });
      await this.refresh();
    } catch (error) {
      this.toast.error(extractErrorMessage(error));
    }
  }

  async remove(service: SalonServiceModel): Promise<void> {
    if (!confirm(`Delete "${service.name}"? This can't be undone.`)) return;
    try {
      await this.salonService.deleteService(service.id);
      this.toast.success('Service deleted');
      await this.refresh();
    } catch (error) {
      this.toast.error(extractErrorMessage(error));
    }
  }

  private async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      this.services.set(await this.salonService.getServices(this.salonId));
    } finally {
      this.loading.set(false);
    }
  }
}
