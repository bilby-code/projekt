* Instruktioner till Copilot / Claude Code eller annan Ai-assisterad Vibe-coding-tjänst

** Mall
Du hittar en mall med exempel på hur HTML-koden ska skrivas i filen "template.html". Den innehåller en länk till max.size.js som maximerar elementet <main> till att fylla största möjliga del av skärmen. Formatet på sidan bestäms av attributen width och height. Om du ska ändra sidans format detta påverkar samtliga storleks- och placerings-referenser) så var försiktig!
XXX 

I plugins-mappen finns script.js där hela motorn för navigation och autostart av video. Använd det systemet och inget annat för dessa funktioner.

Nya sidor skapas genom att lägga till en <section> i <main>. Det gör att sidorna kan tonas in och ut.


** Filer
Lägg ev. javascript-funktioner i filen script.js med tydliga kommentarer. Lägg inte in script inline

** Stil
All placering och positionering sker med bootstrap. 
Det finns dynamiska klassnamn som ser ut som bootstrap men som skapas on-the-fly med javascrip och gör att det går att skriva t.ex. top-34, left-99, width-55, height-10 eller liknande. Alla värden är i procent i relation till sidans bredd respektive höjd. 

Det finns också andra custom-klasser för t.ex. färger och transitions. Du hittar alla exempel i template.html

Vi använder <a> för att skapa knappar. Följ exemplen med bootstrap-klasser i mallen.

Lägg ingen CSS inline i element eller i dokumentet. All ev. ny kod du vill lägga till ska vara i style.css


** Ljud
Mallen innehåller ramverket WAXML. Det sköter all uppspelning och mixning av ljud. HTML-element kan trigga tre funktioner i WAXML som du behöver känna till:

- trig (startar ett ljud eller en del av en komposition)
- stop (stoppar uppspelningen av ett ljud eller en del av musiken)
- set (sätter en variabel inuti WAXML till ett värde)

Du kopplar event till en funktion med attribut enligt följande modell:

data-waxml-[eventnamn]-[funktion]="[värde]"

Här följer några exempel:

1. TRIG

- Trigga ett ljud med id="sound1" när man klickar på en länk: 
<a data-waxml-click-trig="#sound1">Klicka för att lyssna</a>
- Trigga musiksektionen med classen "A" när man rullar över en länk: 
<a data-waxml-mouseenter-trig=".A">Roll over to play</a>
- Stoppa musiken igen om man rullar av länken:

2. STOP
<a data-waxml-mouseleave-stop=".A">Roll out to stop</a>

3. SET
- Sätt variabeln X till "1" när man klickar:<a data-waxml-click-set="$X=1">Klicka för att sätta variabeln $X till 1</a>
(notera att variabelnamn anges med dollartecken)

Det finns också möjlighet att sätta en variabel till värdet på den slider som triggar eventet:
<label>Sätt variabeln $X till värdet på slidern
<input type="range" data-waxml-input-set="$X=this.value" />
</label>
