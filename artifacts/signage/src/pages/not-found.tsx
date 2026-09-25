import { Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { Logo } from '@/components/brand/logo';

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-8 bg-background px-4">
      <Link href="/" className="text-foreground">
        <Logo className="h-10" />
      </Link>
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="mb-4 flex gap-2">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <h1 className="text-2xl font-bold text-foreground">404 Página não encontrada</h1>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Esqueceu de adicionar a página ao roteador?
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
