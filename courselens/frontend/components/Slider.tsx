import { forwardRef, ElementRef, ComponentPropsWithoutRef } from "react"
import { Root, Track, Range, Thumb } from "@radix-ui/react-slider"

const Slider = forwardRef<
  ElementRef<typeof Root>,
  ComponentPropsWithoutRef<typeof Root>
>(({ className, ...props }, ref) => (
  <Root
    ref={ref}
    className={`relative flex w-full touch-none select-none items-center ${className || ""}`}
    {...props}
  >
    <Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-gray-200">
      <Range className="absolute h-full bg-blue-600" />
    </Track>
    <Thumb className="block h-5 w-5 rounded-full border-2 border-blue-600 bg-white shadow-lg transition-shadow hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
    <Thumb className="block h-5 w-5 rounded-full border-2 border-blue-600 bg-white shadow-lg transition-shadow hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
  </Root>
))
Slider.displayName = Root.displayName

export { Slider }