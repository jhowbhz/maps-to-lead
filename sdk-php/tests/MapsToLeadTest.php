<?php

declare(strict_types=1);

namespace Jhowbhz\MapsToLead\Tests;

use Jhowbhz\MapsToLead\FindOptions;
use Jhowbhz\MapsToLead\MapsToLead;
use Jhowbhz\MapsToLead\MapsToLeadException;
use PHPUnit\Framework\TestCase;

/**
 * Testa o cliente contra o servidor embutido do PHP (tests/server.php).
 */
final class MapsToLeadTest extends TestCase
{
    private const TOKEN = 'secret-token';

    /** @var resource|null */
    private static $proc;
    private static string $baseUrl = '';

    public static function setUpBeforeClass(): void
    {
        $port = self::findFreePort();
        self::$baseUrl = "http://127.0.0.1:{$port}";

        $null = DIRECTORY_SEPARATOR === '\\' ? 'NUL' : '/dev/null';
        $descriptors = [
            0 => ['file', $null, 'r'],
            1 => ['file', $null, 'a'],
            2 => ['file', $null, 'a'],
        ];
        self::$proc = proc_open(
            [PHP_BINARY, '-S', "127.0.0.1:{$port}", __DIR__ . '/server.php'],
            $descriptors,
            $pipes,
        );

        // Espera o servidor aceitar conexões.
        $deadline = microtime(true) + 5.0;
        while (microtime(true) < $deadline) {
            $conn = @fsockopen('127.0.0.1', $port, $errno, $errstr, 0.2);
            if ($conn) {
                fclose($conn);

                return;
            }
            usleep(50000);
        }
        self::fail('O servidor de teste não subiu a tempo.');
    }

    public static function tearDownAfterClass(): void
    {
        if (is_resource(self::$proc)) {
            proc_terminate(self::$proc);
            proc_close(self::$proc);
        }
    }

    private static function findFreePort(): int
    {
        $sock = stream_socket_server('tcp://127.0.0.1:0', $errno, $errstr);
        if ($sock === false) {
            self::fail("Não foi possível reservar porta: {$errstr}");
        }
        $name = stream_socket_get_name($sock, false);
        fclose($sock);

        return (int) substr($name, (int) strrpos($name, ':') + 1);
    }

    private function client(?string $token = self::TOKEN): MapsToLead
    {
        return new MapsToLead(self::$baseUrl, token: $token, timeout: 10.0);
    }

    public function testFindSemToken(): void
    {
        $res = (new MapsToLead(self::$baseUrl))->find(
            query: ['type' => 'software'],
            webhook: ['url' => 'https://webhook.site/x'],
        );
        self::assertSame('job_1', $res['jobId']);
        self::assertSame('https://webhook.site/x', $res['webhook']);
    }

    public function testFindValidaType(): void
    {
        $this->expectException(MapsToLeadException::class);
        (new MapsToLead(self::$baseUrl))->find(query: ['type' => ''], webhook: ['url' => 'x']);
    }

    public function testFindValidaWebhook(): void
    {
        $this->expectException(MapsToLeadException::class);
        (new MapsToLead(self::$baseUrl))->find(query: ['type' => 'x'], webhook: ['url' => '']);
    }

    public function testFindMapeiaOptions(): void
    {
        // FindOptions::fromArray aceita camelCase e snake_case.
        $o = FindOptions::fromArray(['only_with_phone' => true]);
        self::assertTrue($o->onlyWithPhone);
        self::assertTrue($o->onlyRepeat);
        self::assertFalse($o->onlyInfosExtras);
    }

    public function testGetStateComToken(): void
    {
        $state = $this->client()->getState();
        self::assertSame(3, $state['totals']['leads']);
    }

    public function testGetStateSemToken(): void
    {
        $this->expectException(MapsToLeadException::class);
        (new MapsToLead(self::$baseUrl))->getState(); // nem chega a requisitar
    }

    public function testTokenErrado401(): void
    {
        try {
            $this->client('wrong')->getState();
            self::fail('Deveria ter lançado.');
        } catch (MapsToLeadException $e) {
            self::assertSame(401, $e->status);
            self::assertTrue($e->isUnauthorized());
        }
    }

    public function testGetLeads(): void
    {
        $page = $this->client()->getLeads(limit: 12, offset: 0);
        self::assertSame(1, $page['total']);
        self::assertSame('ACME', $page['leads'][0]['name']);
    }

    public function testExportXlsx(): void
    {
        $data = $this->client()->exportLeadsXlsx();
        self::assertIsString($data);
        self::assertStringStartsWith('PK', $data);
    }

    public function testStreamSnapshots(): void
    {
        $snaps = [];
        $this->client()->stream(function (array $snap) use (&$snaps): ?bool {
            $snaps[] = $snap;

            return $snap['totals']['activeJobs'] === 0 ? false : null;
        });

        self::assertCount(2, $snaps);
        self::assertSame(1, $snaps[0]['totals']['activeJobs']);
        self::assertSame(3, $snaps[1]['totals']['leads']);
    }
}
