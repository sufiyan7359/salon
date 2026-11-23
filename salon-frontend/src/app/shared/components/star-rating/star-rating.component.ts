import { Component, input, output, signal } from '@angular/core';

@Component({
  selector: 'app-star-rating',
  templateUrl: './star-rating.component.html',
  styleUrl: './star-rating.component.scss',
})
export class StarRatingComponent {
  readonly rating = input(0);
  readonly interactive = input(false);
  readonly size = input<'sm' | 'md'>('md');
  readonly ratingChange = output<number>();

  readonly stars = [1, 2, 3, 4, 5];
  readonly hoverValue = signal(0);

  select(value: number): void {
    if (!this.interactive()) return;
    this.ratingChange.emit(value);
  }

  onHover(value: number): void {
    if (this.interactive()) this.hoverValue.set(value);
  }

  onLeave(): void {
    this.hoverValue.set(0);
  }

  isFilled(star: number): boolean {
    const active = this.hoverValue() || this.rating();
    return star <= active;
  }
}
