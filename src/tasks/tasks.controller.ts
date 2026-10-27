import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { TasksService } from './tasks.service';

@Controller('tasks')
@UseGuards(AuthGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list() {
    return this.tasks.findAll();
  }

  @Post()
  create(@Body() body: any) {
    return this.tasks.create(body.title);
  }

  @Get('export/slow')
  exportSlow() {
    return this.tasks.exportSlow();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.tasks.findOne(Number(id));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.tasks.update(Number(id), body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tasks.remove(Number(id));
  }
}
