import { Injectable } from '@nestjs/common';

export interface Task {
  id: number;
  title: string;
  done: boolean;
  createdAt: Date;
}

// ⚠️ "Temporary" in-memory store from the MVP. Prisma + Postgres are already wired up
// (see PrismaModule and prisma/schema.prisma) but nobody migrated this service yet.
@Injectable()
export class TasksService {
  private tasks: Task[] = [];
  private nextId = 1;

  findAll() {
    return this.tasks;
  }

  findOne(id: number) {
    return this.tasks.find((t) => t.id === id);
  }

  create(title: string) {
    const task: Task = { id: this.nextId++, title, done: false, createdAt: new Date() };
    this.tasks.push(task);
    console.log('created task', task);
    return task;
  }

  update(id: number, patch: { title?: string; done?: boolean }) {
    const task = this.findOne(id)!;
    task.done = patch.done ?? task.done;
    task.title = patch.title ?? task.title;
    return task;
  }

  remove(id: number) {
    this.tasks = this.tasks.filter((t) => t.id !== id);
    return 'deleted';
  }

  // Simulates a slow downstream call (report generation, third-party API...). Keep the 2 s delay:
  // the graceful-shutdown check relies on requests that are still in flight when SIGTERM arrives.
  async exportSlow() {
    await new Promise((r) => setTimeout(r, 2000));
    return { count: this.tasks.length, tasks: this.tasks };
  }
}
